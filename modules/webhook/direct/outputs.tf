output "webhook_lambda_function" {
  value = aws_lambda_function.webhook
}


output "webhook" {
  value = {
    lambda    = aws_lambda_function.webhook
    log_group = aws_cloudwatch_log_group.webhook
    role      = aws_iam_role.webhook_lambda
  }
}
