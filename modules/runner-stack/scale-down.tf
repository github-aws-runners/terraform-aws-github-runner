locals {
  # Windows Runners can take their sweet time to do anything
  # For an AWS vended AMI with an x86 Mac instance or an Apple silicon Mac instance,
  # the launch time can range from approximately 6 minutes to 20 minutes.
  min_runtime_defaults = {
    "windows" = 15
    "linux"   = 5
    "osx"     = 20
  }
}
resource "aws_lambda_function" "scale_down" {
  s3_bucket         = var.lambda.s3.bucket != null ? var.lambda.s3.bucket : null
  s3_key            = var.lambda.s3.key != null ? var.lambda.s3.key : null
  s3_object_version = var.lambda.s3.object_version != null ? var.lambda.s3.object_version : null
  filename          = var.lambda.s3.bucket == null ? local.lambda_zip : null
  source_code_hash  = var.lambda.s3.bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name     = "${var.prefix}-scale-down"
  role              = aws_iam_role.scale_down.arn
  handler           = "index.scaleDownHandler"
  runtime           = var.lambda.runtime
  timeout           = var.scale_down.timeout
  tags              = local.scale_down_lambda_tags
  memory_size       = var.scale_down.memory_size
  architectures     = [var.lambda.architecture]

  environment {
    variables = merge(local.provider.scale_down.environment_variables, {
      ENVIRONMENT                              = var.prefix
      ENABLE_METRIC_GITHUB_APP_RATE_LIMIT      = var.observability.metrics.enable && var.observability.metrics.metric.enable_github_app_rate_limit
      GHES_URL                                 = var.github.enterprise_server.url
      USER_AGENT                               = var.github.user_agent
      LOG_LEVEL                                = upper(var.observability.logs.level)
      MINIMUM_RUNNING_TIME_IN_MINUTES          = coalesce(var.scale_down.minimum_running_time_in_minutes, local.min_runtime_defaults[var.runner.os])
      NODE_TLS_REJECT_UNAUTHORIZED             = var.github.enterprise_server.url != null && !var.github.enterprise_server.ssl_verify ? 0 : 1
      PARAMETER_GITHUB_APP_ID_NAME             = var.github.app_parameters.id.name
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME     = var.github.app_parameters.key_base64.name
      POWERTOOLS_LOGGER_LOG_EVENT              = var.observability.logs.level == "debug" ? "true" : "false"
      SCALE_DOWN_CONFIG                        = jsonencode(var.scale_down.idle_config)
      POWERTOOLS_SERVICE_NAME                  = "${var.prefix}-scale-down"
      POWERTOOLS_METRICS_NAMESPACE             = var.observability.metrics.namespace
      POWERTOOLS_TRACE_ENABLED                 = var.observability.tracing.mode != null ? true : false
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.observability.tracing.capture_http_requests
      POWERTOOLS_TRACER_CAPTURE_ERROR          = var.observability.tracing.capture_error
      RUNNER_PROVIDER_TYPE                     = local.provider.type
    })
  }

  dynamic "vpc_config" {
    for_each = var.lambda.subnet_ids != null && var.lambda.security_group_ids != null ? [true] : []
    content {
      security_group_ids = var.lambda.security_group_ids
      subnet_ids         = var.lambda.subnet_ids
    }
  }

  dynamic "tracing_config" {
    for_each = var.observability.tracing.mode != null ? [true] : []
    content {
      mode = var.observability.tracing.mode
    }
  }
}

resource "aws_cloudwatch_log_group" "scale_down" {
  name              = "/aws/lambda/${aws_lambda_function.scale_down.function_name}"
  retention_in_days = var.observability.logs.retention_in_days
  kms_key_id        = var.observability.logs.kms_key_id
  log_group_class   = var.observability.logs.class
  tags              = local.scale_down_log_tags
}

resource "aws_cloudwatch_event_rule" "scale_down" {
  name                = "${var.prefix}-scale-down-rule"
  schedule_expression = var.scale_down.schedule_expression
  tags                = local.scale_down_tags
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
  path                 = local.lambda_role_path
  permissions_boundary = var.lambda.role.permissions_boundary
  tags                 = local.scale_down_tags
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
  count      = length(var.lambda.subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.scale_down.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "scale_down_xray" {
  count  = var.observability.tracing.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.scale_down.name
}
