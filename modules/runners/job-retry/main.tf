locals {
  lambda_zip = var.config.zip == null ? "${path.module}/../../../lambdas/functions/control-plane/runners.zip" : var.config.zip
  name       = "job-retry"

  environment_variables = {
    RUNNER_REGISTRATION_LEVEL            = var.config.runner_registration_level != null ? var.config.runner_registration_level : ""
    ENTERPRISE_SLUG                      = var.config.enterprise_slug != null ? var.config.enterprise_slug : ""
    ENABLE_METRIC_JOB_RETRY              = var.config.metrics.enable && var.config.metrics.metric.enable_job_retry
    ENABLE_METRIC_GITHUB_APP_RATE_LIMIT  = var.config.metrics.enable && var.config.metrics.metric.enable_github_app_rate_limit
    GHES_URL                             = var.config.ghes_url
    USER_AGENT                           = var.config.user_agent
    JOB_QUEUE_SCALE_UP_URL               = var.config.sqs_build_queue.url
    PARAMETER_GITHUB_APP_ID_NAME         = var.config.github_app_parameters.id.name
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME = var.config.github_app_parameters.key_base64.name
    PARAMETER_ENTERPRISE_PAT_NAME        = try(var.config.enterprise_pat_parameter.name, "")
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
  policy    = data.aws_iam_policy_document.deny_insecure_transport.json
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
  event_source_arn                   = aws_sqs_queue.job_retry_check_queue.arn
  function_name                      = module.job_retry.lambda.function.arn
  batch_size                         = var.config.lambda_event_source_mapping_batch_size
  maximum_batching_window_in_seconds = var.config.lambda_event_source_mapping_maximum_batching_window_in_seconds
}

resource "aws_lambda_permission" "job_retry" {
  statement_id  = "AllowExecutionFromSQS"
  action        = "lambda:InvokeFunction"
  function_name = module.job_retry.lambda.function.function_name
  principal     = "sqs.amazonaws.com"
  source_arn    = aws_sqs_queue.job_retry_check_queue.arn
}

resource "aws_iam_role_policy" "job_retry" {
  name   = "job_retry-policy"
  role   = module.job_retry.lambda.role.name
  policy = data.aws_iam_policy_document.job_retry.json
}

data "aws_iam_policy_document" "job_retry" {
  dynamic "statement" {
    for_each = length(compact([
      var.config.github_app_parameters.id.arn,
      var.config.github_app_parameters.key_base64.arn,
      try(var.config.enterprise_pat_parameter.arn, ""),
    ])) > 0 ? [1] : []
    content {
      effect  = "Allow"
      actions = ["ssm:GetParameter", "ssm:GetParameters"]
      resources = compact([
        var.config.github_app_parameters.id.arn,
        var.config.github_app_parameters.key_base64.arn,
        try(var.config.enterprise_pat_parameter.arn, ""),
      ])
    }
  }

  statement {
    effect    = "Allow"
    actions   = ["sqs:ReceiveMessage", "sqs:GetQueueAttributes", "sqs:DeleteMessage"]
    resources = [aws_sqs_queue.job_retry_check_queue.arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
    resources = [var.config.sqs_build_queue.arn]
  }

  dynamic "statement" {
    for_each = var.config.kms_key_arn != null && var.config.kms_key_arn != "" ? [var.config.kms_key_arn] : []
    content {
      effect    = "Allow"
      actions   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"]
      resources = [statement.value]
    }
  }
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
