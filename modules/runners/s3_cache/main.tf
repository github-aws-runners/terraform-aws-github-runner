resource "random_string" "random" {
  length  = 8
  special = false
  upper   = false
}

resource "aws_s3_bucket" "runner_cache" {
  bucket        = "${var.config.prefix}-cache-${random_string.random.result}"
  force_destroy = true
  tags          = var.config.tags
}

data "aws_iam_policy_document" "runner_cache_policy" {
  statement {
    principals {
      type        = "AWS"
      identifiers = [var.config.runner_instance_role.arn]
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
      days = 10
    }
    status = "Enabled"
  }
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
