resource "aws_ssm_parameter" "runner_config_run_as" {
  name  = "${var.ssm_paths.root}/${var.ssm_paths.config}/run_as"
  type  = "String"
  value = var.runner_as_root ? "root" : var.runner_run_as
  tags  = local.tags
}

resource "aws_ssm_parameter" "runner_enable_cloudwatch" {
  name  = "${var.ssm_paths.root}/${var.ssm_paths.config}/enable_cloudwatch"
  type  = "String"
  value = var.enable_cloudwatch_agent
  tags  = local.tags
}
