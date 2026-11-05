# Production AWS Deployment Runbook: nipoportal

> **Target Architecture**: Option A (EC2 `t4g.small` Graviton2 + Docker + Caddy Reverse Proxy + AWS SSM)  
> **Target Region**: `ap-southeast-1` (Singapore — Collocated directly with Neon PostgreSQL Primary Database for **1–2 ms DB latency**)  
> **Estimated Cost**: **\$15 – \$18 / month** (zero NAT gateway, zero ALB, port 22 closed, IMDSv2 enforced)

---

## 1. AWS Account & Cost Guardrails Check

1. **Verify Account Type & Billing Credits**:
   - In AWS Console, navigate to **Billing and Cost Management > Credits**.
   - If your account was created on or after **15 July 2025**, you receive a **credit-based Free plan** (approx. \$100 at sign-up + up to \$100 onboarding tasks, valid for **6 months**).
   - **Crucial Warning**: Once credits expire or run out on the Free plan, AWS automatically closes the account (data retained only ~90 days).
   - **Action**: Before running real school operations, upgrade to the standard **Paid Plan** with a credit card on file. Our Terraform configuration enforces a strict **\$20 monthly AWS Budget** with email alerts to ensure total cost predictability.
2. **Hidden Cost Traps Eliminated**:
   - **No NAT Gateway**: Saves \$32.40 / month. The EC2 instance sits in a public subnet with direct Internet Gateway.
   - **No ALB**: Saves \$18 – \$22 / month. Caddy handles TLS termination directly.
   - **No Idle Elastic IP Fee**: EIP is immediately attached to the running EC2 instance.
   - **No SSH Port 22**: Management access is via **AWS Systems Manager (SSM) Session Manager** (free, audited, no public attack surface).

---

## 2. Infrastructure Deployment (Terraform)

> [!IMPORTANT]
> **Safety Rule**: Never run `terraform apply` or create/delete resources without review. Always run `terraform plan` first to inspect the diff and verify estimated charges.

### Step 1: Install & Initialize Terraform
```bash
cd infra
terraform init
```

### Step 2: Configure Variables
Copy `infra/terraform.tfvars.example` to `infra/terraform.tfvars`:
```hcl
aws_region       = "ap-southeast-1"
project_name     = "nipoportal"
environment      = "prod"
instance_type    = "t4g.small"
domain_name      = "portal.your-school.com" # or leave empty to use server IP
alert_email      = "admin@your-school.com"
budget_limit_usd = 20
```

### Step 3: Run Plan (Dry-Run Inspection)
```bash
terraform plan
```
Verify that Terraform creates:
- VPC (`10.0.0.0/16`) + Internet Gateway + Public Subnet
- Security Group (Ports 80 and 443 only; Port 22 is closed)
- EC2 Instance (`t4g.small` Graviton2) with encrypted 30GB gp3 EBS
- Elastic IP attached to instance
- Private ECR repository (`nipoportal-app`) with 10-image lifecycle policy
- Private S3 bucket (`nipoportal-storage-*`) with public access blocked & encryption enabled
- AWS Budget (\$20/mo) & CloudWatch alarms (CPU >85%, status check failure)

### Step 4: Apply (Only After Explicit Approval)
```bash
terraform apply
```

Note the outputs:
- `public_ip`: Fixed server Elastic IP
- `ecr_repository_url`: Docker repository URL
- `s3_bucket_name`: Private upload storage bucket
- `ssm_session_command`: Terminal connection command

---

## 3. GitHub OIDC Setup (No Stored AWS Keys)

To allow GitHub Actions to build and deploy containers without storing static AWS access keys:

1. In AWS Console > IAM > Identity Providers > **Add Provider**:
   - Provider Type: `OpenID Connect`
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
2. Create an IAM Role for GitHub Actions:
   - Trust Policy:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Principal": {
             "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
           },
           "Action": "sts:AssumeRoleWithWebIdentity",
           "Condition": {
             "StringEquals": {
               "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
             },
             "StringLike": {
               "token.actions.githubusercontent.com:sub": "repo:<YOUR_GITHUB_ORG_OR_USER>/<REPO_NAME>:*"
             }
           }
         }
       ]
     }
     ```
   - Attach policies: `AmazonEC2ContainerRegistryPowerUser` and `AmazonSSMFullAccess` (or scoped SSM SendCommand policy).
3. In GitHub Repository > **Settings > Secrets and variables > Actions**:
   - Add Secret `AWS_ROLE_TO_ASSUME`: `arn:aws:iam::<ACCOUNT_ID>:role/github-actions-deploy-role`
   - Add Secret `AWS_INSTANCE_ID`: `<instance_id_from_terraform_output>`
   - Add Variable `AWS_REGION`: `ap-southeast-1`

---

## 4. Initial Server Setup via AWS SSM

Connect to your EC2 instance securely without SSH keys:
```bash
aws ssm start-session --target <INSTANCE_ID> --region ap-southeast-1
```

Once connected on the instance:
1. Verify Docker is running:
   ```bash
   docker --version
   docker compose version
   ```
2. Copy the production environment file to `/opt/nipoportal/.env.production`:
   ```bash
   sudo nano /opt/nipoportal/.env.production
   ```
   Paste the values from `.env.example` with your real database strings, `NEXTAUTH_SECRET`, and `S3_STORAGE_BUCKET`. Set permissions:
   ```bash
   sudo chmod 600 /opt/nipoportal/.env.production
   sudo chown ec2-user:ec2-user /opt/nipoportal/.env.production
   ```

---

## 5. Deployment & Rollback Workflows

### Automated Deployment (GitHub Actions)
Every push to `main` triggers `.github/workflows/deploy.yml`:
1. Runs CI tests and builds standalone container.
2. Pushes container to AWS ECR tagged with Git commit SHA.
3. Sends AWS SSM command to the EC2 server to run `/opt/nipoportal/deploy/deploy.sh sha-<commit>`.
4. The deployment script polls `http://127.0.0.1:3000/api/health/live` for up to 45 seconds.
5. If healthy, updates Caddy and cleans old images.

### Instant Manual Rollback
If any unexpected issue occurs after deployment, run:
```bash
aws ssm start-session --target <INSTANCE_ID> --region ap-southeast-1
bash /opt/nipoportal/deploy/rollback.sh
```
This instantly restores the previous working image in under 5 seconds.

---

## 6. Disaster Recovery & Dual Database Operations

### Multi-Database Topology:
- **Primary**: Neon PostgreSQL in Singapore (`ap-southeast-1`) — 1 to 2 ms latency to EC2.
- **Secondary**: Supabase PostgreSQL in Ireland (`eu-west-1`) — async outbox sync via `/api/internal/sync`.

### Database Operations:
1. **Status & Latency Audit**:
   ```bash
   npx tsx scripts/db-status-all.ts
   ```
2. **Safe Schema Deployments**:
   ```bash
   # Dry-run inspection first
   npx tsx scripts/db-migrate-all.ts --dry-run
   # Apply migrations sequentially (Neon first, then Supabase)
   npx tsx scripts/db-migrate-all.ts
   ```
3. **Automated S3 Database Backups**:
   ```bash
   npx tsx scripts/backup-db.ts
   ```
   Backups are saved as encrypted `.sql.gz` files in `s3://<bucket-name>/backups/`.

---

## 7. Cutover Plan (Keeping Vercel & Render Active)

To transition smoothly with **zero downtime**:
1. **Parallel Run Period (7+ Days)**:
   - Keep Vercel (`nipoportal.vercel.app`) and Render (`portal-1527.onrender.com`) running untouched.
   - Run k6 load tests (`k6 run tests/load/k6-script.js`) against the AWS instance Elastic IP or temporary subdomain.
2. **Update Google OAuth Redirect URIs**:
   - In Google Cloud Console > APIs & Services > Credentials:
   - Add Authorized JavaScript Origin: `https://<your-custom-domain>`
   - Add Authorized Redirect URI: `https://<your-custom-domain>/api/auth/callback/google`
3. **DNS Cutover**:
   - Set TTL on existing DNS records to 300 seconds (5 minutes) 24 hours before cutover.
   - Point DNS A Record to the server's **Elastic IP**.
   - Caddy will automatically detect the domain, negotiate TLS certificates with Let's Encrypt, and serve traffic over HTTPS with HTTP/3 enabled.
4. **Decommissioning**:
   - Only after 7+ consecutive days of verified traffic and zero error logs on AWS, decommission Render and adjust Vercel.

