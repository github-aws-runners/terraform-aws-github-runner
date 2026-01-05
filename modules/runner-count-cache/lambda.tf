# Counter Lambda Function
# Updates DynamoDB counter when EC2 instances change state

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  lambda_zip = "${path.module}/../../lambdas/functions/runner-count-cache/dist/runner-count-cache.zip"
}

resource "aws_lambda_function" "counter" {
  s3_bucket         = var.lambda_s3_bucket != null ? var.lambda_s3_bucket : null
  s3_key            = var.counter_lambda_s3_key != null ? var.counter_lambda_s3_key : null
  s3_object_version = var.counter_lambda_s3_object_version != null ? var.counter_lambda_s3_object_version : null
  filename          = var.lambda_s3_bucket == null ? local.lambda_zip : null
  source_code_hash  = var.lambda_s3_bucket == null && fileexists(local.lambda_zip) ? filebase64sha256(local.lambda_zip) : null

  function_name = "${var.prefix}-runner-count-cache"
  role          = aws_iam_role.counter.arn
  handler       = "index.handler"
  runtime       = var.lambda_runtime
  timeout       = var.counter_lambda_timeout
  memory_size   = var.counter_lambda_memory_size
  architectures = [var.lambda_architecture]
  tags          = merge(local.tags, var.lambda_tags)

  environment {
    variables = {
      DYNAMODB_TABLE_NAME   = aws_dynamodb_table.runner_counts.name
      ENVIRONMENT_FILTER    = var.environment_filter
      TTL_SECONDS           = var.ttl_seconds
      LOG_LEVEL             = "info"
      POWERTOOLS_SERVICE_NAME = "runner-count-cache"
    }
  }

  dynamic "vpc_config" {
    for_each = var.lambda_subnet_ids != null && var.lambda_security_group_ids != null ? [true] : []
    content {
      security_group_ids = var.lambda_security_group_ids
      subnet_ids         = var.lambda_subnet_ids
    }
  }

  dynamic "tracing_config" {
    for_each = var.tracing_config.mode != null ? [true] : []
    content {
      mode = var.tracing_config.mode
    }
  }
}

resource "aws_cloudwatch_log_group" "counter" {
  name              = "/aws/lambda/${aws_lambda_function.counter.function_name}"
  retention_in_days = var.logging_retention_in_days
  kms_key_id        = var.logging_kms_key_id
  tags              = local.tags
}

# IAM Role for Counter Lambda
resource "aws_iam_role" "counter" {
  name                 = "${var.prefix}-runner-count-cache"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role.json
  path                 = var.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# Policy for DynamoDB access
resource "aws_iam_role_policy" "counter_dynamodb" {
  name   = "dynamodb-access"
  role   = aws_iam_role.counter.id
  policy = data.aws_iam_policy_document.counter_dynamodb.json
}

data "aws_iam_policy_document" "counter_dynamodb" {
  statement {
    sid = "DynamoDBAccess"
    actions = [
      "dynamodb:UpdateItem",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
    ]
    resources = [aws_dynamodb_table.runner_counts.arn]
  }
}

# Policy for EC2 DescribeInstances (to get instance tags)
resource "aws_iam_role_policy" "counter_ec2" {
  name   = "ec2-describe"
  role   = aws_iam_role.counter.id
  policy = data.aws_iam_policy_document.counter_ec2.json
}

data "aws_iam_policy_document" "counter_ec2" {
  statement {
    sid = "EC2DescribeInstances"
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeTags",
    ]
    resources = ["*"]
  }
}

# Policy for CloudWatch Logs
resource "aws_iam_role_policy" "counter_logs" {
  name   = "cloudwatch-logs"
  role   = aws_iam_role.counter.id
  policy = data.aws_iam_policy_document.counter_logs.json
}

data "aws_iam_policy_document" "counter_logs" {
  statement {
    sid = "CloudWatchLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      "${aws_cloudwatch_log_group.counter.arn}:*",
    ]
  }
}

# VPC policy if Lambda is in VPC
resource "aws_iam_role_policy_attachment" "counter_vpc" {
  count      = var.lambda_subnet_ids != null ? 1 : 0
  role       = aws_iam_role.counter.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# X-Ray tracing policy
resource "aws_iam_role_policy_attachment" "counter_xray" {
  count      = var.tracing_config.mode != null ? 1 : 0
  role       = aws_iam_role.counter.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}
