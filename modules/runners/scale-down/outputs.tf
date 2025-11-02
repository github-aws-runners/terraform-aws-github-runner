output "lambda" {
  description = "Scale-down Lambda function"
  value       = aws_lambda_function.scale_down
}

output "lambda_log_group" {
  description = "Scale-down Lambda log group"
  value       = aws_cloudwatch_log_group.scale_down
}

output "role" {
  description = "Scale-down Lambda IAM role"
  value       = aws_iam_role.scale_down
}

output "cloudwatch_event_rule" {
  description = "CloudWatch Event Rule for scale-down"
  value       = aws_cloudwatch_event_rule.scale_down
}

output "ssm_parameters" {
  description = "Scale-down configuration parameters stored in SSM"
  value       = aws_ssm_parameter.scale_down_config
}
