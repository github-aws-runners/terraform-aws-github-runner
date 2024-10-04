locals {
  lambda_zip = var.config.zip == null ? "${path.module}/../../lambdas/functions/termination-watcher/termination-watcher.zip" : var.config.zip
  name       = "spot-termination-watcher"

  environment_variables = {
    ENABLE_METRICS_SPOT_WARNING = var.config.metrics != null ? var.config.metrics.enable && var.config.metrics.metric.enable_spot_termination_warning : false
    TAG_FILTERS                 = jsonencode(var.config.tag_filters)
  }

  config = merge(var.config, {
    name                  = local.name,
    handler               = "index.interruptionWarning",
    zip                   = local.lambda_zip,
    environment_variables = local.environment_variables
    metrics_namespace     = var.config.metrics.namespace
  })
}

module "termination_warning_watcher" {
  source = "../lambda"
  lambda = local.config
}


resource "aws_cloudwatch_event_rule" "spot_instance_termination_warning" {
  name        = "${var.config.prefix != null ? format("%s-", var.config.prefix) : ""}spot-instance-termination"
  description = "Spot Instance Termination Warning"

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

resource "aws_iam_role_policy" "lambda_policy" {
  name = "lambda-policy"
  role = module.termination_warning_watcher.lambda.role.name

  policy = templatefile("${path.module}/policies/lambda.json", {})
}
