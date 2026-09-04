resource "aws_lambda_function" "scale_up" {
  s3_bucket                      = var.config.lambda.artifact.s3.bucket
  s3_key                         = var.config.lambda.artifact.s3.key
  s3_object_version              = var.config.lambda.artifact.s3.object_version
  filename                       = var.config.lambda.artifact.s3.bucket == null ? var.config.lambda.artifact.zip : null
  source_code_hash               = var.config.lambda.artifact.s3.bucket == null ? filebase64sha256(var.config.lambda.artifact.zip) : null
  function_name                  = "${var.config.prefix}-scale-up"
  role                           = aws_iam_role.scale_up.arn
  handler                        = "index.scaleUpHandler"
  runtime                        = var.config.lambda.runtime
  timeout                        = var.config.scale_up.timeout
  reserved_concurrent_executions = var.config.scale_up.reserved_concurrent_executions
  memory_size                    = var.config.scale_up.memory_size
  tags                           = var.config.scale_up.tags.lambda
  architectures                  = [var.config.lambda.architecture]

  environment {
    variables = merge(var.runner_provider.scale_up.environment_variables, {
      DISABLE_RUNNER_AUTOUPDATE                 = var.config.runner.auto_update_disabled
      ENABLE_EPHEMERAL_RUNNERS                  = var.config.runner.ephemeral
      ENABLE_JIT_CONFIG                         = var.config.runner.jit_config_enabled
      ENABLE_JOB_QUEUED_CHECK                   = var.config.scale_up.job_queued_check_enabled
      ENABLE_METRIC_GITHUB_APP_RATE_LIMIT       = var.config.observability.metrics.enabled && var.config.observability.metrics.metric.github_app_rate_limit.enabled
      ENABLE_ORGANIZATION_RUNNERS               = var.config.github.organization_runners
      ENVIRONMENT                               = var.config.prefix
      GHES_URL                                  = var.config.github.enterprise_server.url
      USER_AGENT                                = var.config.github.user_agent
      LOG_LEVEL                                 = upper(var.config.observability.logs.level)
      MINIMUM_RUNNING_TIME_IN_MINUTES           = coalesce(var.config.scale_down.minimum_running_time_in_minutes, local.min_runtime_defaults[var.config.runner.os])
      NODE_TLS_REJECT_UNAUTHORIZED              = var.config.github.enterprise_server.url != null && !var.config.github.enterprise_server.ssl_verify ? 0 : 1
      PARAMETER_GITHUB_APP_ID_NAME              = join(":", [for p in var.config.github.app_parameters.id : p.name])
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME      = join(":", [for p in var.config.github.app_parameters.key_base64 : p.name])
      PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME = join(":", [for p in var.config.github.app_parameters.installation_id : p != null ? p.name : ""])
      POWERTOOLS_LOGGER_LOG_EVENT               = var.config.observability.logs.level == "debug" ? "true" : "false"
      POWERTOOLS_METRICS_NAMESPACE              = var.config.observability.metrics.namespace
      POWERTOOLS_TRACE_ENABLED                  = var.config.observability.tracing.mode != null
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS  = var.config.observability.tracing.capture_http_requests
      POWERTOOLS_TRACER_CAPTURE_ERROR           = var.config.observability.tracing.capture_error
      RUNNER_LABELS                             = lower(join(",", var.config.runner.labels))
      RUNNER_GROUP_NAME                         = var.config.runner.group_name
      RUNNER_NAME_PREFIX                        = var.config.runner.name_prefix
      COMPUTE_PROVIDER_TYPE                     = var.runner_provider.type
      RUNNERS_MAXIMUM_COUNT                     = var.config.runner.maximum_count
      POWERTOOLS_SERVICE_NAME                   = "${var.config.prefix}-scale-up"
      SSM_TOKEN_PATH                            = var.config.ssm.token_path
      SSM_CONFIG_PATH                           = var.config.ssm.config_path
      SSM_PARAMETER_STORE_TAGS                  = var.config.ssm.parameter_store_tags
      JOB_RETRY_CONFIG                          = jsonencode(local.job_retry_config)
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

resource "aws_cloudwatch_log_group" "scale_up" {
  name              = "/aws/lambda/${aws_lambda_function.scale_up.function_name}"
  retention_in_days = var.config.observability.logs.retention_in_days
  kms_key_id        = var.config.observability.logs.kms_key_id
  log_group_class   = var.config.observability.logs.class
  tags              = var.config.scale_up.tags.log_group
}

resource "aws_lambda_event_source_mapping" "scale_up" {
  event_source_arn                   = var.config.queue.build.arn
  function_name                      = aws_lambda_function.scale_up.arn
  function_response_types            = ["ReportBatchItemFailures"]
  batch_size                         = var.config.queue.event_source_mapping.batch_size
  maximum_batching_window_in_seconds = var.config.queue.event_source_mapping.maximum_batching_window_in_seconds
  tags                               = var.config.scale_up.tags.event_source_mapping
}

resource "aws_lambda_permission" "scale_runners_lambda" {
  statement_id  = "AllowExecutionFromSQS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scale_up.function_name
  principal     = "sqs.amazonaws.com"
  source_arn    = var.config.queue.build.arn
}

resource "aws_iam_role" "scale_up" {
  name                 = "${substr("${var.config.prefix}-scale-up-lambda", 0, 54)}-${substr(md5("${var.config.prefix}-scale-up-lambda"), 0, 8)}"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role.json
  path                 = var.config.lambda.role.path
  permissions_boundary = var.config.lambda.role.permissions_boundary
  tags                 = var.config.scale_up.tags.resources
}

resource "aws_iam_role_policy" "scale_up" {
  name   = "scale-up-policy"
  role   = aws_iam_role.scale_up.name
  policy = data.aws_iam_policy_document.scale_up.json
}

resource "aws_iam_role_policy" "scale_up_logging" {
  name   = "logging-policy"
  role   = aws_iam_role.scale_up.name
  policy = data.aws_iam_policy_document.scale_up_logging.json
}

resource "aws_iam_role_policy" "service_linked_role" {
  count  = var.runner_provider.scale_up.additional_iam_policy_json != null ? 1 : 0
  name   = "service_linked_role"
  role   = aws_iam_role.scale_up.name
  policy = var.runner_provider.scale_up.additional_iam_policy_json
}

resource "aws_iam_role_policy_attachment" "scale_up_vpc_execution_role" {
  count      = local.vpc_enabled ? 1 : 0
  role       = aws_iam_role.scale_up.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "provider" {
  count      = var.runner_provider.scale_up.managed_policy != null ? 1 : 0
  role       = aws_iam_role.scale_up.name
  policy_arn = var.runner_provider.scale_up.managed_policy.arn
}

resource "aws_iam_role_policy" "scale_up_xray" {
  count  = var.config.observability.tracing.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.scale_up.name
}

resource "aws_iam_role_policy" "job_retry_sqs_publish" {
  count  = var.config.job_retry.enabled ? 1 : 0
  name   = "publish-retry-check-sqs-policy"
  role   = aws_iam_role.scale_up.name
  policy = data.aws_iam_policy_document.scale_up_job_retry_publish[0].json
}
