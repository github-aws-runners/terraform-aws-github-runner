# Shared runner configuration stored in SSM Parameter Store.
resource "aws_ssm_parameter" "runner_agent_mode" {
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/agent_mode"
  type  = "String"
  value = var.runner.ephemeral ? "ephemeral" : "persistent"
  tags  = local.tags
}

resource "aws_ssm_parameter" "disable_default_labels" {
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/disable_default_labels"
  type  = "String"
  value = var.runner.disable_default_labels
  tags  = local.tags
}

resource "aws_ssm_parameter" "jit_config_enabled" {
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/enable_jit_config"
  type  = "String"
  value = var.runner.jit_config_enabled == null ? var.runner.ephemeral : var.runner.jit_config_enabled
  tags  = local.tags
}

resource "aws_ssm_parameter" "token_path" {
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/token_path"
  type  = "String"
  value = "${var.ssm.paths.root}/${var.ssm.paths.tokens}"
  tags  = local.tags
}
