# Provider-neutral job-retry queue and Lambda resources.
locals {
  name = "job-retry"
  vpc_enabled = (
    length(var.config.lambda.vpc.subnet_ids) > 0 &&
    length(var.config.lambda.vpc.security_group_ids) > 0
  )

  lambda_environment_variables = {
    ENVIRONMENT                              = var.config.prefix
    LOG_LEVEL                                = var.config.observability.logs.level
    PREFIX                                   = var.config.prefix
    POWERTOOLS_LOGGER_LOG_EVENT              = var.config.observability.logs.level == "debug" ? "true" : "false"
    POWERTOOLS_SERVICE_NAME                  = local.name
    POWERTOOLS_TRACE_ENABLED                 = var.config.observability.tracing.mode != null
    POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.config.observability.tracing.capture_http_requests
    POWERTOOLS_TRACER_CAPTURE_ERROR          = var.config.observability.tracing.capture_error
    POWERTOOLS_METRICS_NAMESPACE             = var.config.observability.metrics.namespace
  }

  job_retry_environment_variables = {
    ENABLE_ORGANIZATION_RUNNERS               = var.config.github.organization_runners
    ENABLE_METRIC_JOB_RETRY                   = var.config.observability.metrics.enable && var.config.observability.metrics.metric.enable_job_retry
    ENABLE_METRIC_GITHUB_APP_RATE_LIMIT       = var.config.observability.metrics.enable && var.config.observability.metrics.metric.enable_github_app_rate_limit
    GHES_URL                                  = var.config.github.enterprise_server.url
    NODE_TLS_REJECT_UNAUTHORIZED              = var.config.github.enterprise_server.url != null && !var.config.github.enterprise_server.ssl_verify ? 0 : 1
    USER_AGENT                                = var.config.github.user_agent
    JOB_QUEUE_SCALE_UP_URL                    = var.config.queue.build.url
    PARAMETER_GITHUB_APP_ID_NAME              = join(":", [for p in var.config.github.app_parameters.id : p.name])
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME      = join(":", [for p in var.config.github.app_parameters.key_base64 : p.name])
    PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME = join(":", [for p in var.config.github.app_parameters.installation_id : p != null ? p.name : ""])
    RUNNER_NAME_PREFIX                        = var.config.runner.name_prefix
  }

  environment_variables = merge(
    local.lambda_environment_variables,
    var.config.lambda.environment_variables,
    local.job_retry_environment_variables,
  )
}

resource "aws_sqs_queue_policy" "job_retry_check_queue_policy" {
  queue_url = aws_sqs_queue.job_retry_check_queue.id
  policy    = data.aws_iam_policy_document.deny_insecure_transport.json
}

resource "aws_sqs_queue" "job_retry_check_queue" {
  name                       = "${var.config.prefix}-job-retry"
  visibility_timeout_seconds = var.config.lambda.timeout

  sqs_managed_sse_enabled           = var.config.queue.encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = var.config.queue.encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = var.config.queue.encryption.kms_data_key_reuse_period_seconds

  tags = var.config.tags.queue
}

resource "aws_lambda_function" "job_retry" {
  s3_bucket                      = var.config.lambda.artifact.s3.bucket
  s3_key                         = var.config.lambda.artifact.s3.key
  s3_object_version              = var.config.lambda.artifact.s3.object_version
  filename                       = var.config.lambda.artifact.s3.bucket == null ? var.config.lambda.artifact.zip : null
  source_code_hash               = var.config.lambda.artifact.s3.bucket == null ? filebase64sha256(var.config.lambda.artifact.zip) : null
  function_name                  = "${var.config.prefix}-${local.name}"
  role                           = aws_iam_role.job_retry.arn
  handler                        = "index.jobRetryCheck"
  runtime                        = var.config.lambda.runtime
  timeout                        = var.config.lambda.timeout
  memory_size                    = var.config.lambda.memory_size
  reserved_concurrent_executions = var.config.lambda.reserved_concurrent_executions
  architectures                  = [var.config.lambda.architecture]

  environment {
    variables = local.environment_variables
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

  tags = var.config.tags.lambda
}

resource "aws_cloudwatch_log_group" "job_retry" {
  name              = "/aws/lambda/${aws_lambda_function.job_retry.function_name}"
  retention_in_days = var.config.observability.logs.retention_in_days
  kms_key_id        = var.config.observability.logs.kms_key_id
  log_group_class   = var.config.observability.logs.class
  tags              = var.config.tags.log_group
}

resource "aws_iam_role" "job_retry" {
  name                 = "${substr("${var.config.prefix}-${local.name}", 0, 54)}-${substr(md5("${var.config.prefix}-${local.name}"), 0, 8)}"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role.json
  path                 = var.config.lambda.role.path
  permissions_boundary = var.config.lambda.role.permissions_boundary
  tags                 = var.config.tags.resources
}

resource "aws_iam_role_policy" "job_retry_logging" {
  name   = "logging-policy"
  role   = aws_iam_role.job_retry.name
  policy = data.aws_iam_policy_document.job_retry_logging.json
}

resource "aws_iam_role_policy_attachment" "job_retry_vpc_execution_role" {
  count      = local.vpc_enabled ? 1 : 0
  role       = aws_iam_role.job_retry.name
  policy_arn = "arn:${var.config.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "job_retry_xray" {
  count  = var.config.observability.tracing.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.job_retry.name
}

resource "aws_lambda_event_source_mapping" "job_retry" {
  event_source_arn                   = aws_sqs_queue.job_retry_check_queue.arn
  function_name                      = aws_lambda_function.job_retry.arn
  batch_size                         = var.config.queue.event_source_mapping.batch_size
  maximum_batching_window_in_seconds = var.config.queue.event_source_mapping.maximum_batching_window_in_seconds
  tags                               = var.config.tags.event_source_mapping
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
      aws_sqs_queue.job_retry_check_queue.arn
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
