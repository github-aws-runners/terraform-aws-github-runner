# Shared runner configuration stored in SSM Parameter Store.
resource "aws_ssm_parameter" "runner_agent_mode" {
  name  = "${var.ssm_paths.root}/${var.ssm_paths.config}/agent_mode"
  type  = "String"
  value = var.enable_ephemeral_runners ? "ephemeral" : "persistent"
  tags  = local.tags
}

resource "aws_ssm_parameter" "disable_default_labels" {
  name  = "${var.ssm_paths.root}/${var.ssm_paths.config}/disable_default_labels"
  type  = "String"
  value = var.runner_disable_default_labels
  tags  = local.tags
}

resource "aws_ssm_parameter" "jit_config_enabled" {
  name  = "${var.ssm_paths.root}/${var.ssm_paths.config}/enable_jit_config"
  type  = "String"
  value = var.enable_jit_config == null ? var.enable_ephemeral_runners : var.enable_jit_config
  tags  = local.tags
}

resource "aws_ssm_parameter" "token_path" {
  name  = "${var.ssm_paths.root}/${var.ssm_paths.config}/token_path"
  type  = "String"
  value = "${var.ssm_paths.root}/${var.ssm_paths.tokens}"
  tags  = local.tags
}
