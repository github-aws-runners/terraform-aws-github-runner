resource "aws_ssm_parameter" "runner_config_run_as" {
  name  = "/${var.prefix}/runner/run-as"
  type  = "String"
  value = var.runner_as_root ? "root" : var.runner_run_as
  tags  = local.tags
}

resource "aws_ssm_parameter" "runner_agent_mode" {
  name  = "/${var.prefix}/runner/agent-mode"
  type  = "String"
  value = var.enable_ephemeral_runners ? "ephemeral" : "persistent"
  tags  = local.tags
}

resource "aws_ssm_parameter" "runner_enable_cloudwatch" {
  name  = "/${var.prefix}/runner/enable-cloudwatch"
  type  = "String"
  value = var.enable_cloudwatch_agent
  tags  = local.tags
}
