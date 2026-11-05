# Private S3 Bucket for App Uploads and Scheduled Database Dumps
resource "aws_s3_bucket" "storage" {
  bucket        = "${var.project_name}-storage-${random_id.suffix.hex}"
  force_destroy = false

  tags = {
    Name = "${var.project_name}-storage"
  }
}

# 1. Total Public Access Block (Guardrail: zero public exposure)
resource "aws_s3_bucket_public_access_block" "storage_block" {
  bucket = aws_s3_bucket.storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 2. Server-side encryption (SSE-S3 AES-256)
resource "aws_s3_bucket_server_side_encryption_configuration" "storage_encryption" {
  bucket = aws_s3_bucket.storage.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# 3. Object versioning for accidental delete protection
resource "aws_s3_bucket_versioning" "storage_versioning" {
  bucket = aws_s3_bucket.storage.id

  versioning_configuration {
    status = "Enabled"
  }
}

# 4. Lifecycle rules to keep S3 storage costs minimal
resource "aws_s3_bucket_lifecycle_configuration" "storage_lifecycle" {
  bucket = aws_s3_bucket.storage.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 60
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "archive-database-backups"
    status = "Enabled"

    filter {
      prefix = "backups/"
    }

    transition {
      days          = 14
      storage_class = "GLACIER"
    }

    expiration {
      days = 90
    }
  }
}

# 5. CORS configuration for pre-signed direct browser uploads
resource "aws_s3_bucket_cors_configuration" "storage_cors" {
  bucket = aws_s3_bucket.storage.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST", "GET", "HEAD"]
    allowed_origins = [
      var.domain_name != "" ? "https://${var.domain_name}" : "*",
      "https://nipoportal.vercel.app",
      "http://localhost:3000"
    ]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

