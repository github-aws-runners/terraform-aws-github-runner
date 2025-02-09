locals {
  name = "spot-termination-handler"

  config = merge(var.config, {
    name    = local.name,
    handler = "index.termination",
    environment_variables = {
      ENABLE_METRICS_SPOT_TERMINATION = var.config.metrics != null ? var.config.metrics.enable && var.config.metrics.metric.enable_spot_termination : false
      TAG_FILTERS                     = jsonencode(var.config.tag_filters)
    }
  })
}

module "termination_handler" {
  source = "../../lambda"
  lambda = local.config
}

resource "aws_cloudwatch_event_rule" "spot_instance_termination" {
  name        = "${var.config.prefix != null ? format("%s-", var.config.prefix) : ""}spot-termination"
  description = "Spot Instance Termination (BidEventicedEvent)"
  tags        = local.config.tags

  event_pattern = <<EOF
{
  "source": ["aws.ec2"],
  "detail-type": ["AWS Service Event via CloudTrail"],
  "detail": {
    "eventSource": ["ec2.amazonaws.com"],
    "eventName": ["BidEvictedEvent"]
  }
}
EOF
}

resource "aws_cloudwatch_event_target" "main" {
  rule = aws_cloudwatch_event_rule.spot_instance_termination.name
  arn  = module.termination_handler.lambda.function.arn
}

resource "aws_lambda_permission" "main" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = module.termination_handler.lambda.function.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.spot_instance_termination.arn
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "lambda-policy"
  role = module.termination_handler.lambda.role.name

  policy = templatefile("${path.module}/../policies/lambda.json", {})
}
