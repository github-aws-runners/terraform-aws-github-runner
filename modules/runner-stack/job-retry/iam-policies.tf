# IAM policies attached to the job-retry Lambda role.
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    dynamic "principals" {
      for_each = var.config.principals

      content {
        type        = principals.value.type
        identifiers = principals.value.identifiers
      }
    }
  }
}

data "aws_iam_policy_document" "job_retry_logging" {
  statement {
    effect = "Allow"

    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = ["${aws_cloudwatch_log_group.job_retry.arn}*"]
  }
}

data "aws_iam_policy_document" "lambda_xray" {
  count = var.config.tracing_config.mode != null ? 1 : 0

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
    effect = "Allow"

    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]

    resources = [
      var.config.github_app_parameters.key_base64.arn,
      var.config.github_app_parameters.id.arn,
    ]
  }

  statement {
    effect = "Allow"

    actions = [
      "sqs:ReceiveMessage",
      "sqs:GetQueueAttributes",
      "sqs:DeleteMessage",
    ]

    resources = [aws_sqs_queue.job_retry_check_queue.arn]
  }

  statement {
    effect = "Allow"

    actions = [
      "sqs:SendMessage",
      "sqs:GetQueueAttributes",
    ]

    resources = [var.config.sqs_build_queue.arn]
  }

  dynamic "statement" {
    for_each = var.config.kms_key == null ? [] : [var.config.kms_key]

    content {
      effect = "Allow"

      actions = [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey",
      ]

      resources = [statement.value.arn]
    }
  }
}
