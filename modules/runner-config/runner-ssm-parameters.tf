# Shared runner configuration stored in SSM Parameter Store.
resource "aws_ssm_parameter" "runner_agent_mode" {
  name  = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.config}/agent_mode"
  type  = "String"
  value = local.orchestration_provider_runner_lifecycle.ephemeral ? "ephemeral" : "persistent"
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "disable_default_labels" {
  name  = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.config}/disable_default_labels"
  type  = "String"
  value = var.runner.disable_default_labels
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "jit_config_enabled" {
  name  = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.config}/enable_jit_config"
  type  = "String"
  value = local.orchestration_provider_runner_lifecycle.jit_config_enabled
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "token_path" {
  name  = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.config}/token_path"
  type  = "String"
  value = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.tokens}"
  tags  = local.ssm_parameter_tags
}
