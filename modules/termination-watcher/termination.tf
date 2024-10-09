module "termination_handler" {
  count  = var.config.features.enable_spot_termination_handler ? 1 : 0
  source = "./termination"

  config = local.config
}

# }

# resource "aws_cloudwatch_event_rule" "spot_instance_termination" {
#   name        = "${var.config.prefix != null ? format("%s-", var.config.prefix) : ""}spot-termination"
#   description = "Spot Instance Termination (BidEventicedEvent)"

#   event_pattern = <<EOF
# {
#   "source": ["aws.ec2"],
#   "detail-type": ["AWS Service Event via CloudTrail"],
#   "detail": {
#     "eventSource": ["ec2.amazonaws.com"],
#     "eventName": ["BidEvictedEvent"]
#   }
# }
# EOF
# }

# resource "aws_cloudwatch_event_target" "main" {
#   rule = aws_cloudwatch_event_rule.spot_instance_termination.name
#   arn  = module.termination_handler.lambda.function.arn
# }

# resource "aws_lambda_permission" "main" {
#   statement_id  = "AllowExecutionFromCloudWatch"
#   action        = "lambda:InvokeFunction"
#   function_name = module.termination_handler.lambda.function.function_name
#   principal     = "events.amazonaws.com"
#   source_arn    = aws_cloudwatch_event_rule.spot_instance_termination.arn
# }

# resource "aws_iam_role_policy" "lambda_policy" {
#   name = "lambda-policy"
#   role = module.termination_warning.lambda.role.name

#   policy = templatefile("${path.module}/policies/lambda.json", {})
# }
