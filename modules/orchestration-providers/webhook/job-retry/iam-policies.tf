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

  source_policy_documents = [data.aws_iam_policy_document.ssm_job_retry.json]

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
}
