# Lambda MicroVM image source artifacts must be stored in an S3 bucket in the
# same region as the image. A separate helper deployment owns the bucket in each
# supported region.
resource "aws_s3_bucket" "artifacts" {
  #checkov:skip=CKV_AWS_145:SSE-S3 protects ephemeral content-addressed build inputs; this helper has no CMK artifact contract.
  #checkov:skip=CKV_AWS_144:Lambda MicroVM builds require same-region artifacts, so this regional bucket intentionally has no cross-region replication.
  #checkov:skip=CKV_AWS_18:CloudTrail records control-plane access and the bucket contains short-lived build inputs; separate S3 access logging is not required.
  #checkov:skip=CKV2_AWS_62:The publisher uploads artifacts synchronously and no event-driven consumer requires S3 notifications.
  bucket = var.artifact_bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
  skip_destroy            = true
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id = "expire-microvm-build-artifacts"

    # The bucket is dedicated to MicroVM build artifacts, so lifecycle cleanup
    # applies to every object, including abandoned uploads outside the expected
    # publisher prefix.
    filter {}

    expiration {
      days = var.artifact_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.artifact_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    status = "Enabled"
  }

  depends_on = [aws_s3_bucket_versioning.artifacts]
}

data "aws_iam_policy_document" "artifact_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  policy = data.aws_iam_policy_document.artifact_bucket.json
}
