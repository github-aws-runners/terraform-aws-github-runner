locals {
  role_path = var.lambda.role_path == null ? "/${var.lambda.prefix}/" : var.lambda.role_path

  lambda_environment_variables = {
    ENVIRONMENT                              = var.lambda.prefix
    LOG_LEVEL                                = var.lambda.log_level
    PREFIX                                   = var.lambda.prefix
    POWERTOOLS_LOGGER_LOG_EVENT              = var.lambda.log_level == "debug" ? "true" : "false"
    POWERTOOLS_SERVICE_NAME                  = var.lambda.name
    POWERTOOLS_TRACE_ENABLED                 = var.lambda.tracing_config.mode != null ? true : false
    POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.lambda.tracing_config.capture_http_requests
    POWERTOOLS_TRACER_CAPTURE_ERROR          = var.lambda.tracing_config.capture_error
    POWERTOOLS_METRICS_NAMESPACE             = var.lambda.metrics_namespace
  }

  environment_variable = merge(local.lambda_environment_variables, var.lambda.environment_variables)
}

resource "aws_lambda_function" "main" {
  s3_bucket         = var.lambda.s3_bucket != null ? var.lambda.s3_bucket : null
  s3_key            = var.lambda.s3_key != null ? var.lambda.s3_key : null
  s3_object_version = var.lambda.s3_object_version != null ? var.lambda.s3_object_version : null
  filename          = var.lambda.s3_bucket == null ? var.lambda.zip : null
  source_code_hash  = var.lambda.s3_bucket == null ? filebase64sha256(var.lambda.zip) : null
  function_name     = "${var.lambda.prefix}-${var.lambda.name}"
  role              = aws_iam_role.main.arn
  handler           = var.lambda.handler
  runtime           = var.lambda.runtime
  timeout           = var.lambda.timeout
  memory_size       = var.lambda.memory_size
  architectures     = [var.lambda.architecture]

  environment {
    variables = local.environment_variable
  }

  dynamic "vpc_config" {
    for_each = var.lambda.subnet_ids != null && var.lambda.security_group_ids != null ? [true] : []
    content {
      security_group_ids = var.lambda.security_group_ids
      subnet_ids         = var.lambda.subnet_ids
    }
  }

  tags = merge(var.lambda.tags, var.lambda.lambda_tags)

  dynamic "tracing_config" {
    for_each = var.lambda.tracing_config.mode != null ? [true] : []
    content {
      mode = var.lambda.tracing_config.mode
    }
  }
}

resource "aws_cloudwatch_log_group" "main" {
  name              = "/aws/lambda/${aws_lambda_function.main.function_name}"
  retention_in_days = var.lambda.logging_retention_in_days
  kms_key_id        = var.lambda.logging_kms_key_id
  tags              = var.lambda.tags
}

resource "aws_iam_role" "main" {
  name                 = "${var.lambda.prefix}-${var.lambda.name}"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.lambda.role_permissions_boundary

  tags = var.lambda.tags
}

data "aws_iam_policy_document" "lambda_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    dynamic "principals" {
      for_each = var.lambda.principals

      content {
        type        = principals.value.type
        identifiers = principals.value.identifiers
      }
    }
  }
}

resource "aws_iam_role_policy" "lambda_logging" {
  name = "logging-policy"
  role = aws_iam_role.main.id

  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.main.arn
  })
}

resource "aws_iam_role_policy_attachment" "vpc_execution_role" {
  count      = length(var.lambda.subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.main.name
  policy_arn = "arn:${var.lambda.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}


resource "aws_iam_role_policy" "xray" {
  count  = var.lambda.tracing_config.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.main.name
}
