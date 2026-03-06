locals {
  name = "spot-termination-notification"

  config = merge(var.config, {
    name    = local.name,
    handler = "index.interruptionWarning",
    environment_variables = merge({
      ENABLE_METRICS_SPOT_WARNING = var.config.metrics != null ? var.config.metrics.enable && var.config.metrics.metric.enable_spot_termination_warning : false
      TAG_FILTERS                 = jsonencode(var.config.tag_filters)
    }, var.config._deregistration_env_vars)
  })
}

module "termination_warning_watcher" {
  source = "../../lambda"
  lambda = local.config
}

resource "aws_cloudwatch_event_rule" "spot_instance_termination_warning" {
  name        = "${var.config.prefix != null ? format("%s-", var.config.prefix) : ""}spot-notify"
  description = "Spot Instance Termination Warning"
  tags        = local.config.tags

  event_pattern = <<EOF
{
  "source": ["aws.ec2"],
  "detail-type": ["EC2 Spot Instance Interruption Warning"]
}
EOF
}

resource "aws_cloudwatch_event_target" "main" {
  rule = aws_cloudwatch_event_rule.spot_instance_termination_warning.name
  arn  = module.termination_warning_watcher.lambda.function.arn
}

resource "aws_lambda_permission" "main" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = module.termination_warning_watcher.lambda.function.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.spot_instance_termination_warning.arn
}

# EC2 Instance State-change Notification — catches ALL termination types
# (scale-down, manual, spot reclamation, ASG) not just spot-specific events.
# Uses "shutting-down" state to deregister runners while instance metadata is still available.
# Reuses the same Lambda as the spot interruption warning handler since both event
# types have detail['instance-id'] — the handler extracts it identically.
resource "aws_cloudwatch_event_rule" "ec2_instance_state_change" {
  count = var.config._enable_runner_deregistration ? 1 : 0

  name        = "${var.config.prefix != null ? format("%s-", var.config.prefix) : ""}instance-termination"
  description = "EC2 Instance Termination (all causes) — deregisters runners from GitHub"
  tags        = local.config.tags

  event_pattern = <<EOF
{
  "source": ["aws.ec2"],
  "detail-type": ["EC2 Instance State-change Notification"],
  "detail": {
    "state": ["shutting-down"]
  }
}
EOF
}

resource "aws_cloudwatch_event_target" "state_change" {
  count = var.config._enable_runner_deregistration ? 1 : 0

  rule = aws_cloudwatch_event_rule.ec2_instance_state_change[0].name
  arn  = module.termination_warning_watcher.lambda.function.arn
}

resource "aws_lambda_permission" "state_change" {
  count = var.config._enable_runner_deregistration ? 1 : 0

  statement_id  = "AllowExecutionFromCloudWatchStateChange"
  action        = "lambda:InvokeFunction"
  function_name = module.termination_warning_watcher.lambda.function.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ec2_instance_state_change[0].arn
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "lambda-policy"
  role = module.termination_warning_watcher.lambda.role.name

  policy = templatefile("${path.module}/../policies/lambda.json", {})
}

resource "aws_iam_role_policy" "ssm_policy" {
  count = var.config._enable_runner_deregistration ? 1 : 0

  name = "ssm-policy"
  role = module.termination_warning_watcher.lambda.role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = var.config._ssm_parameter_arns
      }
    ]
  })
}
