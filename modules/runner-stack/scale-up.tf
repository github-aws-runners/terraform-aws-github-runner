locals {
  job_retry_config = local.job_retry_enabled ? {
    enable         = var.job_retry.enabled
    maxAttempts    = var.job_retry.max_attempts
    delayInSeconds = var.job_retry.delay_in_seconds
    delayBackoff   = var.job_retry.delay_backoff
    queueUrl       = module.job_retry[0].job_retry_check_queue.url
  } : {}
}

resource "aws_lambda_function" "scale_up" {
  s3_bucket                      = var.lambda.s3.bucket != null ? var.lambda.s3.bucket : null
  s3_key                         = var.lambda.s3.key != null ? var.lambda.s3.key : null
  s3_object_version              = var.lambda.s3.object_version != null ? var.lambda.s3.object_version : null
  filename                       = var.lambda.s3.bucket == null ? local.lambda_zip : null
  source_code_hash               = var.lambda.s3.bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name                  = "${var.prefix}-scale-up"
  role                           = aws_iam_role.scale_up.arn
  handler                        = "index.scaleUpHandler"
  runtime                        = var.lambda.runtime
  timeout                        = var.scale_up.timeout
  reserved_concurrent_executions = var.scale_up.reserved_concurrent_executions
  memory_size                    = var.scale_up.memory_size
  tags                           = merge(local.tags, var.lambda.tags)
  architectures                  = [var.lambda.architecture]
  environment {
    variables = merge(local.provider.scale_up.environment_variables, {
      DISABLE_RUNNER_AUTOUPDATE                = var.runner.auto_update_disabled
      ENABLE_EPHEMERAL_RUNNERS                 = var.runner.ephemeral
      ENABLE_JIT_CONFIG                        = var.runner.jit_config_enabled
      ENABLE_JOB_QUEUED_CHECK                  = local.enable_job_queued_check
      ENABLE_METRIC_GITHUB_APP_RATE_LIMIT      = var.observability.metrics.enable && var.observability.metrics.metric.enable_github_app_rate_limit
      ENABLE_ORGANIZATION_RUNNERS              = var.github.organization_runners
      ENVIRONMENT                              = var.prefix
      GHES_URL                                 = var.github.enterprise_server.url
      USER_AGENT                               = var.github.user_agent
      LOG_LEVEL                                = upper(var.observability.log_level)
      MINIMUM_RUNNING_TIME_IN_MINUTES          = coalesce(var.scale_down.minimum_running_time_in_minutes, local.min_runtime_defaults[var.runner.os])
      NODE_TLS_REJECT_UNAUTHORIZED             = var.github.enterprise_server.url != null && !var.github.enterprise_server.ssl_verify ? 0 : 1
      PARAMETER_GITHUB_APP_ID_NAME             = var.github.app_parameters.id.name
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME     = var.github.app_parameters.key_base64.name
      POWERTOOLS_LOGGER_LOG_EVENT              = var.observability.log_level == "debug" ? "true" : "false"
      POWERTOOLS_METRICS_NAMESPACE             = var.observability.metrics.namespace
      POWERTOOLS_TRACE_ENABLED                 = var.observability.tracing.mode != null ? true : false
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.observability.tracing.capture_http_requests
      POWERTOOLS_TRACER_CAPTURE_ERROR          = var.observability.tracing.capture_error
      RUNNER_LABELS                            = lower(join(",", var.runner.labels))
      RUNNER_GROUP_NAME                        = var.runner.group_name
      RUNNER_NAME_PREFIX                       = var.runner.name_prefix
      RUNNER_PROVIDER_TYPE                     = local.provider.type
      RUNNERS_MAXIMUM_COUNT                    = var.runner.maximum_count
      POWERTOOLS_SERVICE_NAME                  = "${var.prefix}-scale-up"
      SSM_TOKEN_PATH                           = local.token_path
      SSM_CONFIG_PATH                          = "${var.ssm.paths.root}/${var.ssm.paths.config}"
      SSM_PARAMETER_STORE_TAGS                 = local.parameter_store_tags
      JOB_RETRY_CONFIG                         = jsonencode(local.job_retry_config)
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

resource "aws_cloudwatch_log_group" "scale_up" {
  name              = "/aws/lambda/${aws_lambda_function.scale_up.function_name}"
  retention_in_days = var.observability.logs.retention_in_days
  kms_key_id        = var.observability.logs.kms_key_id
  log_group_class   = var.observability.logs.class
  tags              = var.tags
}

resource "aws_lambda_event_source_mapping" "scale_up" {
  event_source_arn                   = var.queue.build.arn
  function_name                      = aws_lambda_function.scale_up.arn
  function_response_types            = ["ReportBatchItemFailures"]
  batch_size                         = var.queue.event_source_mapping.batch_size
  maximum_batching_window_in_seconds = var.queue.event_source_mapping.maximum_batching_window_in_seconds
  tags                               = var.tags
}

resource "aws_lambda_permission" "scale_runners_lambda" {
  statement_id  = "AllowExecutionFromSQS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scale_up.function_name
  principal     = "sqs.amazonaws.com"
  source_arn    = var.queue.build.arn
}

resource "aws_iam_role" "scale_up" {
  name                 = "${substr("${var.prefix}-scale-up-lambda", 0, 54)}-${substr(md5("${var.prefix}-scale-up-lambda"), 0, 8)}"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.lambda_role_path
  permissions_boundary = var.lambda.role.permissions_boundary
  tags                 = local.tags
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
  count  = local.provider.scale_up.additional_iam_policy_json != null ? 1 : 0
  name   = "service_linked_role"
  role   = aws_iam_role.scale_up.name
  policy = local.provider.scale_up.additional_iam_policy_json
}

resource "aws_iam_role_policy_attachment" "scale_up_vpc_execution_role" {
  count      = length(var.lambda.subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.scale_up.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "ami_id_ssm_parameter_read" {
  count      = local.provider.scale_up.managed_policy_enabled ? 1 : 0
  role       = aws_iam_role.scale_up.name
  policy_arn = local.provider.scale_up.managed_policy_arn
}

resource "aws_iam_role_policy" "scale_up_xray" {
  count  = var.observability.tracing.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.scale_up.name
}

resource "aws_iam_role_policy" "job_retry_sqs_publish" {
  count  = local.job_retry_enabled ? 1 : 0
  name   = "publish-retry-check-sqs-policy"
  role   = aws_iam_role.scale_up.name
  policy = data.aws_iam_policy_document.scale_up_job_retry_publish[0].json
}
