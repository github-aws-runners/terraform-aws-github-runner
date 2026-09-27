data "aws_iam_policy_document" "housekeeper" {
  dynamic "statement" {
    for_each = var.storage_provider.aws.ssm != null ? [true] : []

    content {
      effect = "Allow"
      actions = [
        "ssm:DeleteParameter",
        "ssm:GetParametersByPath",
      ]
      resources = [var.storage_provider.aws.ssm.cleanup.parameter_path_arn]
    }
  }
}

locals {
  ssm_environment_variables = var.storage_provider.aws.ssm != null ? {
    SSM_CLEANUP_CONFIG = jsonencode(local.cleanup_config)
  } : {}
}