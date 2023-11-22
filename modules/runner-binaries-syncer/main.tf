locals {
  action_runner_distribution_object_key = "actions-runner-${var.runner_os}.${var.runner_os == "linux" ? "tar.gz" : "zip"}"
}

resource "aws_s3_bucket" "action_dist" {
  bucket        = var.distribution_bucket_name
  force_destroy = true
  tags          = var.tags
}

resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.action_dist.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "bucket_config" {
  bucket = aws_s3_bucket.action_dist.id

  rule {
    id     = "lifecycle_config"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    transition {
      days          = 35
      storage_class = "INTELLIGENT_TIERING"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "action_dist" {
  bucket = aws_s3_bucket.action_dist.id
  count  = try(var.server_side_encryption_configuration, null) != null ? 1 : 0

  dynamic "rule" {
    for_each = [lookup(var.server_side_encryption_configuration, "rule", {})]

    content {
      bucket_key_enabled = lookup(rule.value, "bucket_key_enabled", null)

      dynamic "apply_server_side_encryption_by_default" {
        for_each = length(keys(lookup(rule.value, "apply_server_side_encryption_by_default", {}))) == 0 ? [] : [
        lookup(rule.value, "apply_server_side_encryption_by_default", {})]

        content {
          sse_algorithm     = apply_server_side_encryption_by_default.value.sse_algorithm
          kms_master_key_id = lookup(apply_server_side_encryption_by_default.value, "kms_master_key_id", null)
        }
      }
    }
  }
}

resource "aws_s3_bucket_public_access_block" "action_dist" {
  bucket                  = aws_s3_bucket.action_dist.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "action_dist_logging" {
  count = var.s3_logging_bucket != null ? 1 : 0

  bucket        = aws_s3_bucket.action_dist.id
  target_bucket = var.s3_logging_bucket
  target_prefix = var.s3_logging_bucket_prefix != null ? var.s3_logging_bucket_prefix : var.distribution_bucket_name
}

resource "aws_s3_bucket_versioning" "action_dist" {
  bucket = aws_s3_bucket.action_dist.id
  versioning_configuration {
    status = var.s3_versioning
  }
}

data "aws_iam_policy_document" "action_dist_bucket_policy" {
  statement {
    sid       = "ForceSSLOnlyAccess"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.action_dist.arn, "${aws_s3_bucket.action_dist.arn}/*"]

    principals {
      identifiers = ["*"]
      type        = "*"
    }

    condition {
      test     = "Bool"
      values   = ["false"]
      variable = "aws:SecureTransport"
    }
  }

  dynamic "statement" {
    for_each = try(var.server_side_encryption_configuration.rule.apply_server_side_encryption_by_default, null) != null ? [true] : []

    content {
      sid       = "ForceSSE"
      effect    = "Deny"
      actions   = ["s3:PutObject"]
      resources = ["${aws_s3_bucket.action_dist.arn}/*"]

      principals {
        type = "AWS"

        identifiers = [
          "*",
        ]
      }

      condition {
        test     = "StringNotEquals"
        variable = "s3:x-amz-server-side-encryption"
        values   = [var.server_side_encryption_configuration.rule.apply_server_side_encryption_by_default.sse_algorithm]
      }
    }
  }
}

resource "aws_s3_bucket_policy" "action_dist_bucket_policy" {
  bucket = aws_s3_bucket.action_dist.id
  policy = data.aws_iam_policy_document.action_dist_bucket_policy.json
}
