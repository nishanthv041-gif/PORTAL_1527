output "instance_id" {
  description = "EC2 Instance ID for SSM Session Manager connections"
  value       = aws_instance.app.id
}

output "public_ip" {
  description = "Fixed Elastic IP of the portal server (add to your DNS A Record)"
  value       = aws_eip.app.public_ip
}

output "ecr_repository_url" {
  description = "URL of the private ECR image repository"
  value       = aws_ecr_repository.app.repository_url
}

output "s3_bucket_name" {
  description = "Private S3 bucket name for uploads and backups"
  value       = aws_s3_bucket.storage.bucket
}

output "ssm_session_command" {
  description = "Command to connect securely to the server terminal via SSM (No SSH key needed)"
  value       = "aws ssm start-session --target ${aws_instance.app.id} --region ${var.aws_region}"
}

output "dns_setup_instructions" {
  description = "How to configure DNS for your custom domain"
  value       = "Create an A Record in your DNS provider: Host '@' (or subdomain) -> IP '${aws_eip.app.public_ip}'. Caddy will automatically issue and renew Let's Encrypt TLS certificates once DNS propagates."
}

