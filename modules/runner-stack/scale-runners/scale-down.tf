resource "aws_lambda_function" "scale_down" {
  s3_bucket         = var.config.lambda.artifact.s3.bucket
  s3_key            = var.config.lambda.artifact.s3.key
  s3_object_version = var.config.lambda.artifact.s3.object_version
  filename          = var.config.lambda.artifact.s3.bucket == null ? var.config.lambda.artifact.zip : null
  source_code_hash  = var.config.lambda.artifact.s3.bucket == null ? filebase64sha256(var.config.lambda.artifact.zip) : null
  function_name     = "${var.config.prefix}-scale-down"
  role              = aws_iam_role.scale_down.arn
  handler           = "index.scaleDownHandler"
  runtime           = var.config.lambda.runtime
  timeout           = var.config.scale_down.timeout
  tags              = var.config.scale_down.tags.lambda
  memory_size       = var.config.scale_down.memory_size
  architectures     = [var.config.lambda.architecture]

  environment {
    variables = merge(var.runner_provider.scale_down.environment_variables, {
      ENVIRONMENT                               = var.config.prefix
      ENABLE_METRIC_GITHUB_APP_RATE_LIMIT       = var.config.observability.metrics.enable && var.config.observability.metrics.metric.enable_github_app_rate_limit
      GHES_URL                                  = var.config.github.enterprise_server.url
      USER_AGENT                                = var.config.github.user_agent
      LOG_LEVEL                                 = upper(var.config.observability.logs.level)
      MINIMUM_RUNNING_TIME_IN_MINUTES           = coalesce(var.config.scale_down.minimum_running_time_in_minutes, local.min_runtime_defaults[var.config.runner.os])
      NODE_TLS_REJECT_UNAUTHORIZED              = var.config.github.enterprise_server.url != null && !var.config.github.enterprise_server.ssl_verify ? 0 : 1
      PARAMETER_GITHUB_APP_ID_NAME              = join(":", [for p in var.config.github.app_parameters.id : p.name])
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME      = join(":", [for p in var.config.github.app_parameters.key_base64 : p.name])
      PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME = join(":", [for p in var.config.github.app_parameters.installation_id : p != null ? p.name : ""])
      POWERTOOLS_LOGGER_LOG_EVENT               = var.config.observability.logs.level == "debug" ? "true" : "false"
      SCALE_DOWN_CONFIG                         = jsonencode(var.config.scale_down.idle_config)
      POWERTOOLS_SERVICE_NAME                   = "${var.config.prefix}-scale-down"
      POWERTOOLS_METRICS_NAMESPACE              = var.config.observability.metrics.namespace
      POWERTOOLS_TRACE_ENABLED                  = var.config.observability.tracing.mode != null
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS  = var.config.observability.tracing.capture_http_requests
      POWERTOOLS_TRACER_CAPTURE_ERROR           = var.config.observability.tracing.capture_error
      COMPUTE_PROVIDER_TYPE                     = var.runner_provider.type
    })
  }

  dynamic "vpc_config" {
    for_each = local.vpc_enabled ? [true] : []

    content {
      security_group_ids = var.config.lambda.vpc.security_group_ids
      subnet_ids         = var.config.lambda.vpc.subnet_ids
    }
  }

  dynamic "tracing_config" {
    for_each = var.config.observability.tracing.mode != null ? [true] : []

    content {
      mode = var.config.observability.tracing.mode
    }
  }
}

resource "aws_cloudwatch_log_group" "scale_down" {
  name              = "/aws/lambda/${aws_lambda_function.scale_down.function_name}"
  retention_in_days = var.config.observability.logs.retention_in_days
  kms_key_id        = var.config.observability.logs.kms_key_id
  log_group_class   = var.config.observability.logs.class
  tags              = var.config.scale_down.tags.log_group
}

resource "aws_cloudwatch_event_rule" "scale_down" {
  name                = "${var.config.prefix}-scale-down-rule"
  schedule_expression = var.config.scale_down.schedule_expression
  state               = var.config.enabled ? "ENABLED" : "DISABLED"
  tags                = var.config.scale_down.tags.resources
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
  name                 = "${substr("${var.config.prefix}-scale-down-lambda", 0, 54)}-${substr(md5("${var.config.prefix}-scale-down-lambda"), 0, 8)}"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role.json
  path                 = var.config.lambda.role.path
  permissions_boundary = var.config.lambda.role.permissions_boundary
  tags                 = var.config.scale_down.tags.resources
}

resource "aws_iam_role_policy" "scale_down" {
  name   = "scale-down-policy"
  role   = aws_iam_role.scale_down.name
  policy = data.aws_iam_policy_document.scale_down.json
}

resource "aws_iam_role_policy" "scale_down_logging" {
  name   = "logging-policy"
  role   = aws_iam_role.scale_down.name
  policy = data.aws_iam_policy_document.scale_down_logging.json
}

resource "aws_iam_role_policy_attachment" "scale_down_vpc_execution_role" {
  count      = local.vpc_enabled ? 1 : 0
  role       = aws_iam_role.scale_down.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "scale_down_xray" {
  count  = var.config.observability.tracing.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.scale_down.name
}
