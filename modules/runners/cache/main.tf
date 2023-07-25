resource "aws_s3_bucket" "runner_cache" {
  bucket        = "${var.config.prefix}-cache"
  force_destroy = true
  tags          = var.config.tags
}

# resource "aws_s3_bucket_policy" "runner_cache" {
#   bucket = aws_s3_bucket.runner_cache.id
#   policy = data.aws_iam_policy_document.runner_cache_policy.json
# }

data "aws_iam_policy_document" "runner_cache_policy" {
  statement {
    principals {
      type        = "AWS"
      identifiers = [var.config.arn_runner_instance_role]
    }

    actions   = ["s3:*"]
    resources = [aws_s3_bucket.runner_cache.arn, "${aws_s3_bucket.runner_cache.arn}/*"]
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "runner_cache_bucket_lifecycle_configuration" {
  bucket = aws_s3_bucket.runner_cache.id
  rule {
    id = "expire-cache"
    filter {}
    expiration {
      days = 10
    }
    status = "Enabled"
  }
}
