resource "random_string" "random" {
  length  = 8
  special = false
  upper   = false
}

data "aws_route_tables" "private" {
  vpc_id = var.config.vpc_id
  filter {
    name   = "tag:Name"
    values = ["*private"]
  }
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id          = var.config.vpc_id
  route_table_ids = data.aws_route_tables.private.ids
  service_name    = "com.amazonaws.${var.config.aws_region}.s3"
}

resource "aws_s3_bucket" "runner_cache" {
  bucket        = "${var.config.prefix}-cache-${random_string.random.result}"
  force_destroy = true
  tags          = var.config.tags
}

data "aws_iam_policy_document" "runner_cache_policy" {
  statement {
    principals {
      type = "AWS"
      identifiers = concat(
        var.config.runner_role_arns,
        [aws_iam_role.oidc_role.arn]
      )
    }

    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.runner_cache.arn,
      "${aws_s3_bucket.runner_cache.arn}/*"
    ]
  }
}

resource "aws_s3_bucket_policy" "runner_cache" {
  bucket = aws_s3_bucket.runner_cache.id
  policy = data.aws_iam_policy_document.runner_cache_policy.json
}

resource "aws_s3_bucket_lifecycle_configuration" "runner_cache_bucket_lifecycle_configuration" {
  bucket = aws_s3_bucket.runner_cache.id
  rule {
    id = "expire-cache"
    filter {}
    expiration {
      days = 3
    }
    status = "Enabled"
  }
}

resource "aws_iam_role" "oidc_role" {
  name = "oidc-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = "sts:AssumeRoleWithWebIdentity",
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_oidc.arn
        },
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:dashpay/platform:*"
          }
        }
      },
    ]
  })
}

resource "aws_iam_openid_connect_provider" "github_oidc" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["ffffffffffffffffffffffffffffffffffffffff"]
  tags            = var.config.tags
}
