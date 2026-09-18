resource "aws_ssm_parameter" "runner_enable_cloudwatch" {
  name  = "${local.ssm_config_ssm_path}/enable_cloudwatch"
  type  = "String"
  value = var.config.cloudwatch_agent.enabled
  tags  = local.ssm_parameter_tags
}
