data "aws_iam_policy_document" "scale_up_common" {
  statement {
    sid    = "WebhookScaleUpWriteRuntimeParameters"
    effect = "Allow"
    actions = [
      "ssm:PutParameter",
      "ssm:AddTagsToResource",
    ]
    resources = [
      var.config.ssm.token_path_arn,
      "${var.config.ssm.token_path_arn}/*",
      var.config.ssm.config_path_arn,
      "${var.config.ssm.config_path_arn}/*",
    ]
  }

  statement {
    sid    = "WebhookScaleUpReadGitHubAppAndRunnerConfigParameters"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = concat(
      [
        var.config.github.app_parameters.id.arn,
        var.config.github.app_parameters.key_base64.arn,
      ],
      var.config.github.app_parameters.additional_app_parameter_arns,
      var.config.github.app_parameters.additional_apps_manifest != null ? [var.config.github.app_parameters.additional_apps_manifest.arn] : [],
      [
        var.config.ssm.config_path_arn,
        "${var.config.ssm.config_path_arn}/*",
      ],
    )
  }

  statement {
    sid    = "WebhookScaleUpConsumeBuildQueue"
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:GetQueueAttributes",
      "sqs:DeleteMessage",
    ]
    resources = [var.config.queue.build.arn]
  }

  dynamic "statement" {
    for_each = var.config.ssm.kms_key_id == null ? [] : [var.config.ssm.kms_key_id]
    iterator = kms_key

    content {
      sid       = "WebhookScaleUpDecryptParameterStore"
      effect    = "Allow"
      actions   = ["kms:Decrypt"]
      resources = [kms_key.value]
    }
  }

  dynamic "statement" {
    for_each = var.config.queue.kms_key_id == null ? [] : [var.config.queue.kms_key_id]
    iterator = kms_key

    content {
      sid       = "WebhookScaleUpDecryptBuildQueue"
      effect    = "Allow"
      actions   = ["kms:Decrypt"]
      resources = [kms_key.value]
    }
  }
}

data "aws_iam_policy_document" "scale_up" {
  source_policy_documents = [
    data.aws_iam_policy_document.scale_up_common.json,
    var.runner_provider.scale_up.iam_policy_json,
  ]
}

data "aws_iam_policy_document" "scale_up_logging" {
  statement {
    sid    = "WebhookScaleUpWriteLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.scale_up.arn}*"]
  }
}

data "aws_iam_policy_document" "scale_up_job_retry_publish" {
  count = var.config.job_retry.enabled ? 1 : 0

  statement {
    sid    = "WebhookScaleUpPublishJobRetryQueue"
    effect = "Allow"
    actions = [
      "sqs:SendMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [var.config.job_retry.queue.arn]
  }
}
