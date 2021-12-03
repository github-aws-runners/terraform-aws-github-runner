resource "aws_ssm_parameter" "runner_config_run_as" {
  name  = "/${var.environment}/runner/run-as"
  type  = "String"
  value = var.runner_as_root ? "root" : "ec2-user"
  tags  = local.tags
}

resource "aws_ssm_parameter" "runner_agent_mode" {
  name = "/${var.environment}/runner/agent-mode"
  type = "String"
  # TODO: Update this to allow for ephemeral runners
  value = "persistent"
  tags  = local.tags
}

resource "aws_ssm_parameter" "runner_enable_cloudwatch" {
  name  = "/${var.environment}/runner/enable-cloudwatch"
  type  = "String"
  value = var.enable_cloudwatch_agent
  tags  = local.tags
}
