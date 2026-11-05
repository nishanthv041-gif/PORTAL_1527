# Security Group: HTTP/HTTPS open to public, Port 22 CLOSED (SSM used for secure shell access)
resource "aws_security_group" "web" {
  name        = "${var.project_name}-web-sg"
  description = "Allow inbound HTTP/HTTPS traffic. SSH (port 22) is closed; use AWS SSM Session Manager."
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP from anywhere (redirected to HTTPS by Caddy)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere (terminated by Caddy)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Outbound connections for DB (Neon, Supabase), ECR pulls, and HTTPS API calls"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-web-sg"
  }
}

