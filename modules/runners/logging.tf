locals {
  logfiles = var.enable_cloudwatch_agent ? [for l in var.runner_log_files : merge(l, { "log_group_name" : aws_cloudwatch_log_group.runners[0].name })] : []
}

resource "aws_ssm_parameter" "cloudwatch_agent_config_runner" {
  count = var.enable_cloudwatch_agent ? 1 : 0
  name  = "${var.environment}-runner"
  type  = "String"
  value = var.cloudwatch_config != null ? var.cloudwatch_config : templatefile("${path.module}/templates/cloudwatch_config.json", {
    logfiles = jsonencode(local.logfiles)
  })
  tags = local.tags
}

resource "aws_cloudwatch_log_group" "runners" {
  count             = var.enable_cloudwatch_agent ? 1 : 0
  name              = "${var.environment}/runners"
  retention_in_days = var.logging_retention_in_days
  tags              = local.tags
}

resource "aws_iam_role_policy" "cloudwatch" {
  count = var.enable_ssm_on_runners ? 1 : 0
  name  = "CloudWatchLogginAndMetrics"
  role  = aws_iam_role.runner.name
  policy = templatefile("${path.module}/policies/instance-cloudwatch-policy.json",
    {
      ssm_parameter_arn = aws_ssm_parameter.cloudwatch_agent_config_runner[0].arn
    }
  )
}
