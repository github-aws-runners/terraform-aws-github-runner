output "role_pool" {
  value = aws_iam_role.pool
}

output "lambda" {
  value = aws_lambda_function.pool
}

output "lambda_log_group" {
  value = aws_cloudwatch_log_group.pool
}
