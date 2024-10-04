locals {
  lambda_zip = var.lambda_zip == null ? "${path.module}/../../lambdas/functions/ami-housekeeper/ami-housekeeper.zip" : var.lambda_zip
  role_path  = var.role_path == null ? "/${var.prefix}/" : var.role_path
}

resource "aws_lambda_function" "ami_housekeeper" {
  s3_bucket         = var.lambda_s3_bucket != null ? var.lambda_s3_bucket : null
  s3_key            = var.lambda_s3_key != null ? var.lambda_s3_key : null
  s3_object_version = var.lambda_s3_object_version != null ? var.lambda_s3_object_version : null
  filename          = var.lambda_s3_bucket == null ? local.lambda_zip : null
  source_code_hash  = var.lambda_s3_bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name     = "${var.prefix}-ami-housekeeper"
  role              = aws_iam_role.ami_housekeeper.arn
  handler           = "index.handler"
  runtime           = var.lambda_runtime
  timeout           = var.lambda_timeout
  memory_size       = var.lambda_memory_size
  architectures     = [var.lambda_architecture]

  environment {
    variables = {
      LOG_LEVEL                                = var.log_level
      POWERTOOLS_LOGGER_LOG_EVENT              = var.log_level == "debug" ? "true" : "false"
      AMI_CLEANUP_OPTIONS                      = jsonencode(var.cleanup_config)
      POWERTOOLS_SERVICE_NAME                  = "ami-housekeeper"
      POWERTOOLS_TRACE_ENABLED                 = var.tracing_config.mode != null ? true : false
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.tracing_config.capture_http_requests
      POWERTOOLS_TRACER_CAPTURE_ERROR          = var.tracing_config.capture_error
    }
  }

  dynamic "vpc_config" {
    for_each = var.lambda_subnet_ids != null && var.lambda_security_group_ids != null ? [true] : []
    content {
      security_group_ids = var.lambda_security_group_ids
      subnet_ids         = var.lambda_subnet_ids
    }
  }

  tags = merge(var.tags, var.lambda_tags)

  dynamic "tracing_config" {
    for_each = var.tracing_config.mode != null ? [true] : []
    content {
      mode = var.tracing_config.mode
    }
  }
}

resource "aws_cloudwatch_log_group" "ami_housekeeper" {
  name              = "/aws/lambda/${aws_lambda_function.ami_housekeeper.function_name}"
  retention_in_days = var.logging_retention_in_days
  kms_key_id        = var.logging_kms_key_id
  tags              = var.tags
}

resource "aws_iam_role" "ami_housekeeper" {
  name                 = "${var.prefix}-ami-housekeeper-role"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary

  tags = var.tags
}

data "aws_iam_policy_document" "lambda_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    dynamic "principals" {
      for_each = var.lambda_principals

      content {
        type        = principals.value.type
        identifiers = principals.value.identifiers
      }
    }
  }
}

resource "aws_iam_role_policy" "lambda_logging" {
  name = "logging-policy"
  role = aws_iam_role.ami_housekeeper.id

  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.ami_housekeeper.arn
  })
}

resource "aws_iam_role_policy" "ami_housekeeper" {
  name = "lambda-ami-policy"
  role = aws_iam_role.ami_housekeeper.id

  policy = templatefile("${path.module}/policies/lambda-ami-housekeeper.json", {})
}

resource "aws_cloudwatch_event_rule" "ami_housekeeper" {
  name                = "${var.prefix}-ami-housekeeper"
  schedule_expression = var.lambda_schedule_expression
  tags                = var.tags
  state               = var.state_event_rule_ami_housekeeper
}

resource "aws_cloudwatch_event_target" "ami_housekeeper" {
  rule = aws_cloudwatch_event_rule.ami_housekeeper.name
  arn  = aws_lambda_function.ami_housekeeper.arn
}

resource "aws_iam_role_policy_attachment" "ami_housekeeper_vpc_execution_role" {
  count      = length(var.lambda_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.ami_housekeeper.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_lambda_permission" "ami_housekeeper" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ami_housekeeper.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ami_housekeeper.arn
}

resource "aws_iam_role_policy" "ami_housekeeper_xray" {
  count  = var.tracing_config.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.ami_housekeeper.name
}
