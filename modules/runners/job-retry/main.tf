locals {
  lambda_zip = var.config.zip == null ? "${path.module}/../../../lambdas/functions/control-plane/runners.zip" : var.config.zip
  name       = "job-retry"

  environment_variables = {
    ENABLE_ORGANIZATION_RUNNERS          = var.config.enable_organization_runners
    ENABLE_METRIC_JOB_RETRY              = var.config.metrics.enable && var.config.metrics.metric.enable_job_retry
    ENABLE_METRIC_GITHUB_APP_RATE_LIMIT  = var.config.metrics.enable && var.config.metrics.metric.enable_github_app_rate_limit
    GHES_URL                             = var.config.ghes_url
    JOB_QUEUE_SCALE_UP_URL               = var.config.sqs_build_queue.url
    PARAMETER_GITHUB_APP_ID_NAME         = var.config.github_app_parameters.id.name
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME = var.config.github_app_parameters.key_base64.name
  }

  config = merge(var.config, {
    name                  = local.name,
    handler               = "index.jobRetryCheck",
    zip                   = local.lambda_zip,
    environment_variables = local.environment_variables
    metrics_namespace     = var.config.metrics.namespace
  })
}

resource "aws_sqs_queue_policy" "job_retry_check_queue_policy" {
  queue_url = aws_sqs_queue.job_retry_check_queue.id
  policy    = data.aws_iam_policy_document.deny_unsecure_transport.json
}

resource "aws_sqs_queue" "job_retry_check_queue" {
  name                       = "${var.config.prefix}-job-retry"
  visibility_timeout_seconds = local.config.timeout

  sqs_managed_sse_enabled           = var.config.queue_encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = var.config.queue_encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = var.config.queue_encryption.kms_data_key_reuse_period_seconds

  tags = var.config.tags
}

module "job_retry" {
  source = "../../lambda"
  lambda = local.config
}

resource "aws_lambda_event_source_mapping" "job_retry" {
  event_source_arn = aws_sqs_queue.job_retry_check_queue.arn
  function_name    = module.job_retry.lambda.function.arn
  batch_size       = 1
}

resource "aws_lambda_permission" "job_retry" {
  statement_id  = "AllowExecutionFromSQS"
  action        = "lambda:InvokeFunction"
  function_name = module.job_retry.lambda.function.function_name
  principal     = "sqs.amazonaws.com"
  source_arn    = aws_sqs_queue.job_retry_check_queue.arn
}

resource "aws_iam_role_policy" "job_retry" {
  name = "job_retry-policy"
  role = module.job_retry.lambda.role.name
  policy = templatefile("${path.module}/policies/lambda.json", {
    kms_key_arn               = var.config.kms_key_arn != null ? var.config.kms_key_arn : ""
    sqs_build_queue_arn       = var.config.sqs_build_queue.arn
    sqs_job_retry_queue_arn   = aws_sqs_queue.job_retry_check_queue.arn
    github_app_id_arn         = var.config.github_app_parameters.id.arn
    github_app_key_base64_arn = var.config.github_app_parameters.key_base64.arn
  })
}

data "aws_iam_policy_document" "deny_unsecure_transport" {
  statement {
    sid = "DenyUnsecureTransport"

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
