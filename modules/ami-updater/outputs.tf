output "lambda" {
  description = "The Lambda function"
  value = {
    function_name = aws_lambda_function.ami_updater.function_name
    arn           = aws_lambda_function.ami_updater.arn
  }
}

output "role" {
  description = "The IAM role of the Lambda function"
  value = {
    name = aws_iam_role.ami_updater.name
    arn  = aws_iam_role.ami_updater.arn
  }
}

output "eventbridge" {
  description = "The EventBridge rule"
  value = {
    name = aws_cloudwatch_event_rule.ami_updater.name
    arn  = aws_cloudwatch_event_rule.ami_updater.arn
  }
}
