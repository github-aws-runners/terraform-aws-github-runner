data "aws_iam_policy_document" "ssm_scale_down_common" {
  dynamic "statement" {
    for_each = var.storage_provider.aws.ssm != null ? [true] : []
    content {
      sid     = "WebhookScaleDownReadGitHubAppParameters"
      effect  = "Allow"
      actions = ["ssm:GetParameter", "ssm:GetParameters"]
      resources = concat(
        [var.config.github.app_parameters.id.arn, var.config.github.app_parameters.key_base64.arn],
        var.config.github.app_parameters.additional_app_parameter_arns,
        var.config.github.app_parameters.additional_apps_manifest != null ? [var.config.github.app_parameters.additional_apps_manifest.arn] : [],
      )
    }
  }

  dynamic "statement" {
    for_each = var.storage_provider.aws.ssm != null && var.storage_provider.aws.ssm.kms_key_id != null ? [var.storage_provider.aws.ssm.kms_key_id] : []
    iterator = kms_key

    content {
      sid       = "WebhookScaleDownDecryptParameterStore"
      effect    = "Allow"
      actions   = ["kms:Decrypt"]
      resources = [kms_key.value]
    }
  }
}

data "aws_iam_policy_document" "ssm_scale_up_common" {
  dynamic "statement" {
    for_each = var.storage_provider.aws.ssm != null ? [true] : []
    content {
      sid     = "WebhookScaleUpWriteRuntimeParameters"
      effect  = "Allow"
      actions = ["ssm:PutParameter", "ssm:AddTagsToResource"]
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
      sid     = "WebhookScaleUpReadGitHubAppAndRunnerConfigParameters"
      effect  = "Allow"
      actions = ["ssm:GetParameter", "ssm:GetParameters"]
      resources = concat(
        [var.config.github.app_parameters.id.arn, var.config.github.app_parameters.key_base64.arn],
        var.config.github.app_parameters.additional_app_parameter_arns,
        var.config.github.app_parameters.additional_apps_manifest != null ? [var.config.github.app_parameters.additional_apps_manifest.arn] : [],
        [
          var.storage_provider.aws.ssm.config_path_arn,
          "${var.storage_provider.aws.ssm.config_path_arn}/*",
        ],
      )
    }
  }

  dynamic "statement" {
    for_each = var.storage_provider.aws.ssm != null && var.storage_provider.aws.ssm.kms_key_id != null ? [var.storage_provider.aws.ssm.kms_key_id] : []
    iterator = kms_key

    content {
      sid       = "WebhookScaleUpDecryptParameterStore"
      effect    = "Allow"
      actions   = ["kms:Decrypt"]
      resources = [kms_key.value]
    }
  }
}


locals {
  scale_up_ssm_environment_variables = var.storage_provider.aws.ssm != null ? {
    PARAMETER_GITHUB_APP_ID_NAME         = var.config.github.app_parameters.id.name
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME = var.config.github.app_parameters.key_base64.name
    PARAMETER_GITHUB_APPS_MANIFEST_NAME  = var.config.github.app_parameters.additional_apps_manifest != null ? var.config.github.app_parameters.additional_apps_manifest.name : ""
    SSM_TOKEN_PATH                       = var.storage_provider.aws.ssm.token_path
    SSM_CONFIG_PATH                      = var.storage_provider.aws.ssm.config_path
    SSM_PARAMETER_STORE_TAGS             = var.storage_provider.aws.ssm.parameter_store_tags
  } : {}

  scale_down_ssm_environment_variables = var.storage_provider.aws.ssm != null ? {
    PARAMETER_GITHUB_APP_ID_NAME         = var.config.github.app_parameters.id.name
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME = var.config.github.app_parameters.key_base64.name
    PARAMETER_GITHUB_APPS_MANIFEST_NAME  = var.config.github.app_parameters.additional_apps_manifest != null ? var.config.github.app_parameters.additional_apps_manifest.name : ""
    SSM_TOKEN_PATH                       = var.storage_provider.aws.ssm.token_path
  } : {}
}