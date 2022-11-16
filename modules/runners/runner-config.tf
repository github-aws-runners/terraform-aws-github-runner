resource "aws_ssm_parameter" "runner_config_run_as" {
  name  = "${var.ssm_paths.root}/${var.ssm_paths.config}/run-as"
  type  = "String"
  value = var.runner_as_root ? "root" : var.runner_run_as
  tags  = local.tags
}

resource "aws_ssm_parameter" "runner_agent_mode" {
  name  = "${var.ssm_paths.root}/${var.ssm_paths.config}/agent-mode"
  type  = "String"
  value = var.enable_ephemeral_runners ? "ephemeral" : "persistent"
  tags  = local.tags
}

resource "aws_ssm_parameter" "runner_enable_cloudwatch" {
  name  = "${var.ssm_paths.root}/${var.ssm_paths.config}/enable-cloudwatch"
  type  = "String"
  value = var.enable_cloudwatch_agent
  tags  = local.tags
}

resource "aws_ssm_parameter" "token_path" {
  name  = "${var.ssm_paths.root}/${var.ssm_paths.config}/token_path"
  type  = "String"
  value = "${var.ssm_paths.root}/${var.ssm_paths.tokens}"
  tags  = local.tags
}
