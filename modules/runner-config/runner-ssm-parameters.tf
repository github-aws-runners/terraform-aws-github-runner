# Shared runner configuration stored in SSM Parameter Store.
resource "aws_ssm_parameter" "runner_agent_mode" {
  count = var.storage_provider.type == "aws_ssm" ? 1 : 0
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/agent_mode"
  type  = "String"
  value = local.orchestration_provider_runner_lifecycle.ephemeral ? "ephemeral" : "persistent"
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "disable_default_labels" {
  count = var.storage_provider.type == "aws_ssm" ? 1 : 0
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/disable_default_labels"
  type  = "String"
  value = var.runner.disable_default_labels
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "jit_config_enabled" {
  count = var.storage_provider.type == "aws_ssm" ? 1 : 0
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/enable_jit_config"
  type  = "String"
  value = local.orchestration_provider_runner_lifecycle.jit_config_enabled
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "token_path" {
  count = var.storage_provider.type == "aws_ssm" ? 1 : 0
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/token_path"
  type  = "String"
  value = "${var.ssm.paths.root}/${var.ssm.paths.tokens}"
  tags  = local.ssm_parameter_tags
}

moved {
  from = aws_ssm_parameter.runner_agent_mode
  to   = aws_ssm_parameter.runner_agent_mode[0]
}

moved {
  from = aws_ssm_parameter.disable_default_labels
  to   = aws_ssm_parameter.disable_default_labels[0]
}

moved {
  from = aws_ssm_parameter.jit_config_enabled
  to   = aws_ssm_parameter.jit_config_enabled[0]
}

moved {
  from = aws_ssm_parameter.token_path
  to   = aws_ssm_parameter.token_path[0]
}
