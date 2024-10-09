module "termination_notification" {
  count  = var.config.features.enable_spot_termination_notification_watcher ? 1 : 0
  source = "./notification"

  config = local.config
}

# module "termination_warning_watcher" {
#   source = "../lambda"
#   lambda = local.config
# }

# resource "aws_cloudwatch_event_rule" "spot_instance_termination_warning" {
#   name        = "${var.config.prefix != null ? format("%s-", var.config.prefix) : ""}spot-warning"
#   description = "Spot Instance Termination Warning"

#   event_pattern = <<EOF
# {
#   "source": ["aws.ec2"],
#   "detail-type": ["EC2 Spot Instance Interruption Warning"]
# }
# EOF
# }

# resource "aws_cloudwatch_event_target" "main" {
#   rule = aws_cloudwatch_event_rule.spot_instance_termination_warning.name
#   arn  = module.termination_warning_watcher.lambda.function.arn
# }

# resource "aws_lambda_permission" "main" {
#   statement_id  = "AllowExecutionFromCloudWatch"
#   action        = "lambda:InvokeFunction"
#   function_name = module.termination_warning_watcher.lambda.function.function_name
#   principal     = "events.amazonaws.com"
#   source_arn    = aws_cloudwatch_event_rule.spot_instance_termination_warning.arn
# }

# resource "aws_iam_role_policy" "lambda_policy" {
#   name = "lambda-policy"
#   role = module.termination_warning_watcher.lambda.role.name

#   policy = templatefile("${path.module}/policies/lambda.json", {})
# }
