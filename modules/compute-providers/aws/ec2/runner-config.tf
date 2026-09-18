resource "aws_ssm_parameter" "runner_config_run_as" {
  count = var.storage_provider.type == "aws_ssm" ? 1 : 0
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/run_as"
  type  = "String"
  value = var.runner.run_as_root ? "root" : var.runner.run_as
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "runner_enable_cloudwatch" {
  count = var.storage_provider.type == "aws_ssm" ? 1 : 0
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/enable_cloudwatch"
  type  = "String"
  value = var.config.cloudwatch_agent.enabled
  tags  = local.ssm_parameter_tags
}

moved {
  from = aws_ssm_parameter.runner_config_run_as
  to   = aws_ssm_parameter.runner_config_run_as[0]
}

moved {
  from = aws_ssm_parameter.runner_enable_cloudwatch
  to   = aws_ssm_parameter.runner_enable_cloudwatch[0]
}
