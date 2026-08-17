resource "aws_ssm_parameter" "runner_config_run_as" {
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/run_as"
  type  = "String"
  value = var.runner.run_as_root ? "root" : var.runner.run_as
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "runner_enable_cloudwatch" {
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/enable_cloudwatch"
  type  = "String"
  value = var.config.cloudwatch_agent.enabled
  tags  = local.ssm_parameter_tags
}
