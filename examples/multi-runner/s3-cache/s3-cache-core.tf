resource "aws_s3_bucket" "core_runner_cache" {
  bucket = "core-runner-cache"
}

resource "aws_s3_bucket_policy" "core_runner_cache_bucket_policy" {
  bucket = aws_s3_bucket.core_runner_cache.id
  policy = data.aws_iam_policy_document.core_runner_cache_policy.json
}

data "aws_iam_role" "core_runner_role" {
  name = "core-runner-role"
}

data "aws_iam_policy_document" "core_runner_cache_policy" {
  statement {
    principals {
      type        = "AWS"
      identifiers = [data.aws_iam_role.core_runner_role.arn]
    }

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
    ]

    resources = [
      aws_s3_bucket.core_runner_cache.arn,
      "${aws_s3_bucket.core_runner_cache.arn}/*",
    ]
  }
}

resource "aws_iam_policy" "core_runner_cache_bucket_access_policy" {
  name = "core_runner_cache_bucket_access_policy"
  path = "/"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Effect = "Allow"
        Resource = [
          aws_s3_bucket.core_runner_cache.arn,
          "${aws_s3_bucket.core_runner_cache.arn}/*"
        ]
      }
    ]
  })
}
