# IAM policies attached to the job-retry Lambda role.
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
    for_each = var.config.kms_key_arn == null ? [] : var.config.kms_key_arn == "" ? [] : [var.config.kms_key_arn]

    content {
      effect = "Allow"

      actions = [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey",
      ]

      resources = [statement.value]
    }
  }
}
