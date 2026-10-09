locals {
  ssm_environment_variables = var.storage_provider.aws.ssm != null ? {
    PARAMETER_GITHUB_APP_ID_NAME         = var.config.github.app_parameters.id.name
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME = var.config.github.app_parameters.key_base64.name
    PARAMETER_GITHUB_APPS_MANIFEST_NAME  = var.config.github.app_parameters.additional_apps_manifest != null ? var.config.github.app_parameters.additional_apps_manifest.name : ""
  } : {}
}

data "aws_iam_policy_document" "ssm_job_retry" {

  dynamic "statement" {
    for_each = var.storage_provider.aws.ssm != null ? [true] : []
    content {
      sid     = "WebhookJobRetryReadGitHubAppParameters"
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
      sid       = "WebhookJobRetryDecryptParameterStore"
      effect    = "Allow"
      actions   = ["kms:Decrypt"]
      resources = [kms_key.value]
    }
  }
}
