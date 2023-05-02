resource "aws_s3_bucket" "platform_runner_cache" {
  bucket = "platform-runner-cache"
}

resource "aws_s3_bucket_policy" "platform_runner_cache_bucket_policy" {
  bucket = aws_s3_bucket.platform_runner_cache.id
  policy = data.aws_iam_policy_document.platform_runner_cache_policy.json
}

data "aws_iam_policy_document" "platform_runner_cache_policy" {
  statement {
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::854439639386:role/platform/platform-runner-role"]
    }

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
    ]

    resources = [
      aws_s3_bucket.platform_runner_cache.arn,
      "${aws_s3_bucket.platform_runner_cache.arn}/*",
    ]
  }
}

resource "aws_iam_policy" "platform_runner_cache_bucket_access_policy" {
  name = "platform_runner_cache_bucket_access_policy"
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
          aws_s3_bucket.platform_runner_cache.arn,
          "${aws_s3_bucket.platform_runner_cache.arn}/*"
        ]
      }
    ]
  })
}
