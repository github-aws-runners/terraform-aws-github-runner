# IAM policies attached to the pool Lambda role.
data "aws_iam_policy_document" "pool_common" {
  dynamic "statement" {
    for_each = var.storage_provider.type == "aws_ssm" ? [true] : []

    content {
      sid    = "WebhookPoolWriteRuntimeParameters"
      effect = "Allow"

      actions = [
        "ssm:AddTagsToResource",
        "ssm:PutParameter",
      ]

      resources = [
        var.config.ssm_token_path_arn,
        "${var.config.ssm_token_path_arn}/*",
        var.config.arn_ssm_parameters_path_config,
        "${var.config.arn_ssm_parameters_path_config}/*",
      ]
    }
  }

  dynamic "statement" {
    for_each = var.storage_provider.type == "aws_ssm" ? [true] : []

    content {
      sid    = "WebhookPoolReadRunnerConfigParameters"
      effect = "Allow"

      actions = [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath",
      ]

      resources = [
        var.config.arn_ssm_parameters_path_config,
        "${var.config.arn_ssm_parameters_path_config}/*",
      ]
    }
  }

  dynamic "statement" {
    for_each = var.storage_provider.type == "aws_ssm" ? [true] : []

    content {
      sid    = "WebhookPoolReadGitHubAppParameters"
      effect = "Allow"

      actions = [
        "ssm:GetParameter",
        "ssm:GetParameters",
      ]

      resources = concat(
        [for p in var.config.github_app_parameters.id : p.arn],
        [for p in var.config.github_app_parameters.key_base64 : p.arn],
        [for p in var.config.github_app_parameters.installation_id : p.arn if p != null],
      )
    }
  }

  dynamic "statement" {
    for_each = var.storage_provider.type == "aws_ssm" && var.config.kms_key_id != null ? [var.config.kms_key_id] : []
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
