# AWS Systems Manager-specific control-plane configuration.
locals {
  ssm_config_path = try("${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.config}", "")

  ssm_tags                    = merge(local.common_tags, try(var.storage_provider.aws.ssm.tags, {}))
  ssm_parameter_tags          = merge(local.ssm_tags, try(var.storage_provider.aws.ssm.parameters.tags, {}))
  ssm_housekeeper_tags        = merge(local.ssm_tags, try(var.storage_provider.aws.ssm.housekeeper.tags, {}))
  ssm_housekeeper_lambda_tags = merge(local.lambda_tags, try(var.storage_provider.aws.ssm.tags, {}), try(var.storage_provider.aws.ssm.housekeeper.tags, {}))
  ssm_housekeeper_log_tags    = merge(local.observability_log_tags, try(var.storage_provider.aws.ssm.tags, {}), try(var.storage_provider.aws.ssm.housekeeper.tags, {}))

  ssm_housekeeper_artifact_s3_selected = (
    try(var.storage_provider.aws.ssm.housekeeper.lambda.artifact.s3, null) != null
  )
  ssm_housekeeper_artifact = {
    zip = local.ssm_housekeeper_artifact_s3_selected ? null : coalesce(
      try(var.storage_provider.aws.ssm.housekeeper.lambda.artifact.zip, null),
      local.packaged_runners_lambda_zip,
    )
    s3 = {
      bucket         = local.ssm_housekeeper_artifact_s3_selected ? var.lambda.artifact.s3.bucket : null
      key            = try(var.storage_provider.aws.ssm.housekeeper.lambda.artifact.s3.key, null)
      object_version = try(var.storage_provider.aws.ssm.housekeeper.lambda.artifact.s3.object_version, null)
    }
  }

  kms_key_id                     = try(var.storage_provider.aws.ssm.kms_key_id, null)
  token_path                     = try("${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.tokens}", "")
  arn_ssm_parameters_path_tokens = try("arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.tokens}", "")
  arn_ssm_parameters_path_config = try("arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.config}", "")

  parameter_store_tags = jsonencode([
    for key, value in local.ssm_parameter_tags : {
      Key   = key
      Value = value
    }
  ])

  ssm_common_tags = var.storage_provider.aws.ssm != null ? {
    "ghr:ssm_config_path" = local.ssm_config_path
  } : {}
}

data "aws_caller_identity" "current" {}

# Shared runner configuration stored in SSM Parameter Store.
resource "aws_ssm_parameter" "runner_agent_mode" {
  count = var.storage_provider.aws.ssm != null ? 1 : 0
  name  = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.config}/agent_mode"
  type  = "String"
  value = local.orchestration_provider_runner_lifecycle.ephemeral ? "ephemeral" : "persistent"
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "disable_default_labels" {
  count = var.storage_provider.aws.ssm != null ? 1 : 0
  name  = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.config}/disable_default_labels"
  type  = "String"
  value = var.runner.disable_default_labels
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "jit_config_enabled" {
  count = var.storage_provider.aws.ssm != null ? 1 : 0
  name  = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.config}/enable_jit_config"
  type  = "String"
  value = local.orchestration_provider_runner_lifecycle.jit_config_enabled
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "token_path" {
  count = var.storage_provider.aws.ssm != null ? 1 : 0
  name  = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.config}/token_path"
  type  = "String"
  value = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.tokens}"
  tags  = local.ssm_parameter_tags
}
