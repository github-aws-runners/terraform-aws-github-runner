resource "aws_s3_bucket" "runner_cache" {
  bucket = var.bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_policy" "runner_cache" {
  bucket = aws_s3_bucket.runner_cache.id
  policy = data.aws_iam_policy_document.runner_cache_policy.json
}

data "aws_iam_role" "runner_role" {
  name = "runner-role"
}

data "aws_iam_policy_document" "runner_cache_policy" {
  statement {
    principals {
      type        = "AWS"
      identifiers = [data.aws_iam_role.runner_role.arn]
    }

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
      "s3:GetBucketLocation",
      "s3:ListBucketMultipartUploads",
      "s3:ListMultipartUploadParts"
    ]

    resources = [
      aws_s3_bucket.platform_runner_cache.arn,
      "${aws_s3_bucket.platform_runner_cache.arn}/*",
    ]
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
