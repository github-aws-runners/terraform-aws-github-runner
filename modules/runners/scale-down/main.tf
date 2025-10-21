locals {
  managed_environments = [for e in var.environments : e.environment]
}

# IAM assume role policy for Lambda
data "aws_iam_policy_document" "lambda_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# X-Ray tracing policy
data "aws_iam_policy_document" "lambda_xray" {
  count = var.tracing_config.mode != null ? 1 : 0
  statement {
    actions = [
      "xray:BatchGetTraces",
      "xray:GetTraceSummaries",
      "xray:PutTelemetryRecords",
      "xray:PutTraceSegments"
    ]
    effect = "Allow"
    resources = [
      "*"
    ]
    sid = "AllowXRay"
  }
}

resource "aws_lambda_function" "scale_down" {
  s3_bucket         = var.lambda_s3_bucket != null ? var.lambda_s3_bucket : null
  s3_key            = var.runners_lambda_s3_key != null ? var.runners_lambda_s3_key : null
  s3_object_version = var.runners_lambda_s3_object_version != null ? var.runners_lambda_s3_object_version : null
  filename          = var.lambda_s3_bucket == null ? var.lambda_zip : null
  source_code_hash  = var.lambda_s3_bucket == null ? filebase64sha256(var.lambda_zip) : null
  function_name     = "${var.prefix}-scale-down"
  role              = aws_iam_role.scale_down.arn
  handler           = "index.scaleDownHandler"
  runtime           = var.lambda_runtime
  timeout           = var.lambda_timeout
  tags              = merge(var.tags, var.lambda_tags)
  memory_size       = var.lambda_memory_size
  architectures     = [var.lambda_architecture]

  environment {
    variables = {
      ENVIRONMENT_CONFIGS                      = jsonencode(var.environments)
      ENABLE_METRIC_GITHUB_APP_RATE_LIMIT      = var.metrics.enable && var.metrics.metric.enable_github_app_rate_limit
      GHES_URL                                 = var.ghes_url
      USER_AGENT                               = var.user_agent
      LOG_LEVEL                                = var.log_level
      NODE_TLS_REJECT_UNAUTHORIZED             = var.ghes_url != null && !var.ghes_ssl_verify ? 0 : 1
      PARAMETER_GITHUB_APP_ID_NAME             = var.github_app_parameters.id.name
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME     = var.github_app_parameters.key_base64.name
      POWERTOOLS_LOGGER_LOG_EVENT              = var.log_level == "debug" ? "true" : "false"
      POWERTOOLS_SERVICE_NAME                  = "runners-scale-down"
      POWERTOOLS_METRICS_NAMESPACE             = var.metrics.namespace
      POWERTOOLS_TRACE_ENABLED                 = var.tracing_config.mode != null ? true : false
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.tracing_config.capture_http_requests
      POWERTOOLS_TRACER_CAPTURE_ERROR          = var.tracing_config.capture_error
    }
  }

  dynamic "vpc_config" {
    for_each = length(var.lambda_subnet_ids) > 0 && length(var.lambda_security_group_ids) > 0 ? [true] : []
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

resource "aws_cloudwatch_log_group" "scale_down" {
  name              = "/aws/lambda/${aws_lambda_function.scale_down.function_name}"
  retention_in_days = var.logging_retention_in_days
  kms_key_id        = var.logging_kms_key_id
  tags              = var.tags
}

resource "aws_cloudwatch_event_rule" "scale_down" {
  name                = "${var.prefix}-scale-down-rule"
  schedule_expression = var.schedule_expression
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "scale_down" {
  rule = aws_cloudwatch_event_rule.scale_down.name
  arn  = aws_lambda_function.scale_down.arn
}

resource "aws_lambda_permission" "scale_down" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scale_down.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.scale_down.arn
}

resource "aws_iam_role" "scale_down" {
  name                 = "${substr("${var.prefix}-scale-down-lambda", 0, 54)}-${substr(md5("${var.prefix}-scale-down-lambda"), 0, 8)}"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = var.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = var.tags
}

resource "aws_iam_role_policy" "scale_down" {
  name = "scale-down-policy"
  role = aws_iam_role.scale_down.name
  policy = templatefile("${path.module}/policies/lambda-scale-down.json", {
    environments              = jsonencode(local.managed_environments)
    github_app_id_arn         = var.github_app_parameters.id.arn
    github_app_key_base64_arn = var.github_app_parameters.key_base64.arn
    kms_key_arn               = var.kms_key_arn
  })
}

resource "aws_iam_role_policy" "scale_down_logging" {
  name = "logging-policy"
  role = aws_iam_role.scale_down.name
  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.scale_down.arn
  })
}

resource "aws_iam_role_policy_attachment" "scale_down_vpc_execution_role" {
  count      = length(var.lambda_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.scale_down.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "scale_down_xray" {
  count  = var.tracing_config.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.scale_down.name
}
