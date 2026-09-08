# IAM policies attached to the job-retry Lambda role.
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    sid     = "WebhookJobRetryAssumeRole"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    dynamic "principals" {
      for_each = var.config.lambda.role.principals

      content {
        type        = principals.value.type
        identifiers = principals.value.identifiers
      }
    }
  }
}

data "aws_iam_policy_document" "job_retry_logging" {
  statement {
    sid    = "WebhookJobRetryWriteLogs"
    effect = "Allow"

    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = ["${aws_cloudwatch_log_group.job_retry.arn}*"]
  }
}

data "aws_iam_policy_document" "lambda_xray" {
  count = var.config.observability.tracing.mode != null ? 1 : 0

  # AWS X-Ray write/read trace APIs do not support resource-level permissions.
  statement {
    sid    = "AllowXRay"
    effect = "Allow"
    actions = [
      "xray:BatchGetTraces",
      "xray:GetTraceSummaries",
      "xray:PutTelemetryRecords",
      "xray:PutTraceSegments",
    ]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "job_retry" {
  statement {
    sid    = "WebhookJobRetryReadGitHubAppParameters"
    effect = "Allow"

    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]

    resources = concat(
      [for p in var.config.github.app_parameters.id : p.arn],
      [for p in var.config.github.app_parameters.key_base64 : p.arn],
      [for p in var.config.github.app_parameters.installation_id : p.arn if p != null],
    )
  }

  statement {
    sid    = "WebhookJobRetryConsumeRetryQueue"
    effect = "Allow"

    actions = [
      "sqs:ReceiveMessage",
      "sqs:GetQueueAttributes",
      "sqs:DeleteMessage",
    ]

    resources = [aws_sqs_queue.job_retry_check_queue.arn]
  }

  statement {
    sid    = "WebhookJobRetryPublishBuildQueue"
    effect = "Allow"

    actions = [
      "sqs:SendMessage",
      "sqs:GetQueueAttributes",
    ]

    resources = [var.config.queue.build.arn]
  }

  dynamic "statement" {
    for_each = var.config.ssm.kms_key_id == null ? [] : [var.config.ssm.kms_key_id]
    iterator = kms_key

    content {
      sid       = "WebhookJobRetryDecryptParameterStore"
      effect    = "Allow"
      actions   = ["kms:Decrypt"]
      resources = [kms_key.value]
    }
  }

  dynamic "statement" {
    for_each = var.config.queue.kms_key_id == null ? [] : [var.config.queue.kms_key_id]
    iterator = kms_key

    content {
      sid    = "WebhookJobRetryEncryptBuildQueueMessage"
      effect = "Allow"
      actions = [
        "kms:Decrypt",
        "kms:GenerateDataKey",
      ]
      resources = [kms_key.value]
    }
  }
}
