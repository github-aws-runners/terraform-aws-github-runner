locals {
  ssm_environment_variables = var.storage_provider.aws.ssm != null ? {
    PARAMETER_GITHUB_APP_ID_NAME         = var.config.github_app_parameters.id.name
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME = var.config.github_app_parameters.key_base64.name
    PARAMETER_GITHUB_APPS_MANIFEST_NAME  = var.config.github_app_parameters.additional_apps_manifest != null ? var.config.github_app_parameters.additional_apps_manifest.name : ""
    SSM_TOKEN_PATH                       = var.storage_provider.aws.ssm.token_path
    SSM_CONFIG_PATH                      = var.storage_provider.aws.ssm.config_path
    SSM_PARAMETER_STORE_TAGS             = var.storage_provider.aws.ssm.parameter_store_tags
  } : {}
}

data "aws_iam_policy_document" "ssm_pool_common" {
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