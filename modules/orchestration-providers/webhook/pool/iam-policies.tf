# IAM policies attached to the pool Lambda role.
data "aws_iam_policy_document" "pool_common" {
  dynamic "statement" {
    for_each = var.storage_provider.aws.ssm != null ? [true] : []
    content {
      sid     = "WebhookPoolWriteRuntimeParameters"
      effect  = "Allow"
      actions = ["ssm:AddTagsToResource", "ssm:PutParameter"]
      resources = [
        var.storage_provider.aws.ssm.token_path_arn,
        "${var.storage_provider.aws.ssm.token_path_arn}/*",
        var.storage_provider.aws.ssm.config_path_arn,
        "${var.storage_provider.aws.ssm.config_path_arn}/*",
      ]
    }
  }

  dynamic "statement" {
    for_each = var.storage_provider.aws.ssm != null ? [true] : []
    content {
      sid     = "WebhookPoolReadRunnerConfigParameters"
      effect  = "Allow"
      actions = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
      resources = [
        var.storage_provider.aws.ssm.config_path_arn,
        "${var.storage_provider.aws.ssm.config_path_arn}/*",
      ]
    }
  }

  dynamic "statement" {
    for_each = var.storage_provider.aws.ssm != null ? [true] : []
    content {
      sid     = "WebhookPoolReadGitHubAppParameters"
      effect  = "Allow"
      actions = ["ssm:GetParameter", "ssm:GetParameters"]
      resources = concat(
        [var.config.github_app_parameters.id.arn, var.config.github_app_parameters.key_base64.arn],
        var.config.github_app_parameters.additional_app_parameter_arns,
        var.config.github_app_parameters.additional_apps_manifest != null ? [var.config.github_app_parameters.additional_apps_manifest.arn] : [],
      )
    }
  }

  dynamic "statement" {
    for_each = var.storage_provider.aws.ssm != null && var.storage_provider.aws.ssm.kms_key_id != null ? [var.storage_provider.aws.ssm.kms_key_id] : []
    iterator = kms_key

    content {
      sid       = "WebhookPoolDecryptParameterStore"
      effect    = "Allow"
      actions   = ["kms:Decrypt"]
      resources = [kms_key.value]
    }
  }
}

data "aws_iam_policy_document" "pool_logging" {
  statement {
    sid    = "WebhookPoolWriteLogs"
    effect = "Allow"

    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = ["${aws_cloudwatch_log_group.pool.arn}*"]
  }
}
