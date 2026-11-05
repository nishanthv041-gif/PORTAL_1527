# Data source for Amazon Linux 2023 (ARM64 for t4g or x86_64 for t3)
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = [startswith(var.instance_type, "t4g") ? "al2023-ami-2023.*-arm64" : "al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

# 1. EC2 Instance
resource "aws_instance" "app" {
  ami                  = data.aws_ami.al2023.id
  instance_type        = var.instance_type
  subnet_id            = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.web.id]
  iam_instance_profile = aws_iam_instance_profile.ec2.name

  # Encrypted 30GB gp3 root volume ($2.40/mo)
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 30
    encrypted             = true
    delete_on_termination = true

    tags = {
      Name = "${var.project_name}-root-volume"
    }
  }

  # Security Guardrail: Enforce IMDSv2 (stops SSRF token theft)
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  # Server initialization: Docker, AWS CLI, Deploy directory, Caddy directory
  user_data = <<-EOF
              #!/bin/bash
              set -ex

              # Update packages
              dnf update -y

              # Install Docker and git
              dnf install -y docker git

              # Enable and start Docker service
              systemctl enable --now docker
              usermod -aG docker ec2-user

              # Install Docker Compose Plugin
              DOCKER_CONFIG=/usr/local/lib/docker
              mkdir -p $DOCKER_CONFIG/cli-plugins
              ARCH=$(uname -m)
              if [ "$ARCH" = "aarch64" ]; then
                COMPOSE_ARCH="linux-aarch64"
              else
                COMPOSE_ARCH="linux-x86_64"
              fi
              curl -SL "https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-$COMPOSE_ARCH" -o $DOCKER_CONFIG/cli-plugins/docker-compose
              chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

              # Create application directory
              mkdir -p /opt/nipoportal/deploy
              mkdir -p /opt/nipoportal/caddy_data
              mkdir -p /opt/nipoportal/caddy_config
              chown -R ec2-user:ec2-user /opt/nipoportal

              echo "Initialization complete." > /opt/nipoportal/init.log
              EOF

  tags = {
    Name = "${var.project_name}-server"
  }

  lifecycle {
    ignore_changes = [ami]
  }
}

# 2. Elastic IP (Attached immediately = $0.00 idle penalty)
resource "aws_eip" "app" {
  domain = "vpc"

  tags = {
    Name = "${var.project_name}-eip"
  }
}

resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}

