# Provider-neutral job-retry queue and Lambda resources.
locals {
  name                      = "job-retry"
  lambda_zip                = var.config.zip == null ? "${path.module}/../../../lambdas/functions/control-plane/runners.zip" : var.config.zip
  architecture              = coalesce(var.config.architecture, "arm64")
  aws_partition             = coalesce(var.config.aws_partition, "aws")
  log_level                 = coalesce(var.config.log_level, "info")
  memory_size               = coalesce(var.config.memory_size, 256)
  metrics_namespace         = coalesce(var.config.metrics.namespace, "GitHub Runners")
  logging_retention_in_days = coalesce(var.config.logging_retention_in_days, 180)
  runtime                   = coalesce(var.config.runtime, "nodejs24.x")
  role_path                 = var.config.role_path == null ? "/${var.config.prefix}/" : var.config.role_path
  vpc_enabled               = length(var.config.subnet_ids) > 0 && length(var.config.security_group_ids) > 0

  lambda_environment_variables = {
    ENVIRONMENT                              = var.config.prefix
    LOG_LEVEL                                = local.log_level
    PREFIX                                   = var.config.prefix
    POWERTOOLS_LOGGER_LOG_EVENT              = local.log_level == "debug" ? "true" : "false"
    POWERTOOLS_SERVICE_NAME                  = local.name
    POWERTOOLS_TRACE_ENABLED                 = var.config.tracing_config.mode != null
    POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.config.tracing_config.capture_http_requests
    POWERTOOLS_TRACER_CAPTURE_ERROR          = var.config.tracing_config.capture_error
    POWERTOOLS_METRICS_NAMESPACE             = local.metrics_namespace
  }

  job_retry_environment_variables = {
    ENABLE_ORGANIZATION_RUNNERS          = var.config.enable_organization_runners
    ENABLE_METRIC_JOB_RETRY              = var.config.metrics.enable && var.config.metrics.metric.enable_job_retry
    ENABLE_METRIC_GITHUB_APP_RATE_LIMIT  = var.config.metrics.enable && var.config.metrics.metric.enable_github_app_rate_limit
    GHES_URL                             = var.config.ghes_url
    USER_AGENT                           = var.config.user_agent
    JOB_QUEUE_SCALE_UP_URL               = var.config.sqs_build_queue.url
    PARAMETER_GITHUB_APP_ID_NAME         = var.config.github_app_parameters.id.name
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME = var.config.github_app_parameters.key_base64.name
    RUNNER_NAME_PREFIX                   = var.config.runner_name_prefix
  }

  environment_variables = merge(
    local.lambda_environment_variables,
    var.config.environment_variables,
    local.job_retry_environment_variables,
  )
}

resource "aws_sqs_queue_policy" "job_retry_check_queue_policy" {
  queue_url = aws_sqs_queue.job_retry_check_queue.id
  policy    = data.aws_iam_policy_document.deny_insecure_transport.json
}

resource "aws_sqs_queue" "job_retry_check_queue" {
  name                       = "${var.config.prefix}-job-retry"
  visibility_timeout_seconds = var.config.timeout

  sqs_managed_sse_enabled           = var.config.queue_encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = var.config.queue_encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = var.config.queue_encryption.kms_data_key_reuse_period_seconds

  tags = var.config.queue_tags
}

resource "aws_lambda_function" "job_retry" {
  s3_bucket                      = var.config.s3_bucket
  s3_key                         = var.config.s3_key
  s3_object_version              = var.config.s3_object_version
  filename                       = var.config.s3_bucket == null ? local.lambda_zip : null
  source_code_hash               = var.config.s3_bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name                  = "${var.config.prefix}-${local.name}"
  role                           = aws_iam_role.job_retry.arn
  handler                        = "index.jobRetryCheck"
  runtime                        = local.runtime
  timeout                        = var.config.timeout
  memory_size                    = local.memory_size
  reserved_concurrent_executions = var.config.reserved_concurrent_executions
  architectures                  = [local.architecture]

  environment {
    variables = local.environment_variables
  }

  dynamic "vpc_config" {
    for_each = local.vpc_enabled ? [true] : []

    content {
      security_group_ids = var.config.security_group_ids
      subnet_ids         = var.config.subnet_ids
    }
  }

  dynamic "tracing_config" {
    for_each = var.config.tracing_config.mode != null ? [true] : []

    content {
      mode = var.config.tracing_config.mode
    }
  }

  tags = merge(var.config.tags, var.config.lambda_tags)
}

resource "aws_cloudwatch_log_group" "job_retry" {
  name              = "/aws/lambda/${aws_lambda_function.job_retry.function_name}"
  retention_in_days = local.logging_retention_in_days
  kms_key_id        = var.config.logging_kms_key_id
  log_group_class   = var.config.log_class
  tags              = merge(var.config.tags, var.config.log_group_tags)
}

resource "aws_iam_role" "job_retry" {
  name                 = "${substr("${var.config.prefix}-${local.name}", 0, 54)}-${substr(md5("${var.config.prefix}-${local.name}"), 0, 8)}"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role.json
  path                 = local.role_path
  permissions_boundary = var.config.role_permissions_boundary
  tags                 = var.config.tags
}

resource "aws_iam_role_policy" "job_retry_logging" {
  name   = "logging-policy"
  role   = aws_iam_role.job_retry.name
  policy = data.aws_iam_policy_document.job_retry_logging.json
}

resource "aws_iam_role_policy_attachment" "job_retry_vpc_execution_role" {
  count      = local.vpc_enabled ? 1 : 0
  role       = aws_iam_role.job_retry.name
  policy_arn = "arn:${local.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "job_retry_xray" {
  count  = var.config.tracing_config.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.job_retry.name
}

resource "aws_lambda_event_source_mapping" "job_retry" {
  event_source_arn                   = aws_sqs_queue.job_retry_check_queue.arn
  function_name                      = aws_lambda_function.job_retry.arn
  batch_size                         = var.config.lambda_event_source_mapping_batch_size
  maximum_batching_window_in_seconds = var.config.lambda_event_source_mapping_maximum_batching_window_in_seconds
  tags                               = var.config.queue_tags
}

resource "aws_lambda_permission" "job_retry" {
  statement_id  = "AllowExecutionFromSQS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.job_retry.function_name
  principal     = "sqs.amazonaws.com"
  source_arn    = aws_sqs_queue.job_retry_check_queue.arn
}

resource "aws_iam_role_policy" "job_retry" {
  name   = "job_retry-policy"
  role   = aws_iam_role.job_retry.name
  policy = data.aws_iam_policy_document.job_retry.json
}

data "aws_iam_policy_document" "deny_insecure_transport" {
  statement {
    sid = "DenyInsecureTransport"

    effect = "Deny"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions = [
      "sqs:*"
    ]

    resources = [
      "*"
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
