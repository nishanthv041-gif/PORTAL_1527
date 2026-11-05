variable "aws_region" {
  description = "AWS deployment region. Defaults to Singapore (ap-southeast-1) for lowest latency to Neon DB."
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Project identifier for resource naming and tagging."
  type        = string
  default     = "nipoportal"
}

variable "environment" {
  description = "Deployment environment (e.g., prod, staging)."
  type        = string
  default     = "prod"
}

variable "instance_type" {
  description = "EC2 instance type. t4g.small (ARM64 Graviton2) is recommended for best cost/performance ($12.26/mo)."
  type        = string
  default     = "t4g.small"
}

variable "domain_name" {
  description = "Custom domain or subdomain for the portal (e.g. portal.myschool.edu or nipoportal.com). If empty, server public IP is used with self-signed TLS."
  type        = string
  default     = ""
}

variable "alert_email" {
  description = "Email address for AWS Budget notifications and CloudWatch alarms."
  type        = string
  default     = "admin@school.internal"
}

variable "budget_limit_usd" {
  description = "Strict monthly AWS budget limit in USD to protect against unexpected cost spikes."
  type        = number
  default     = 20
}

