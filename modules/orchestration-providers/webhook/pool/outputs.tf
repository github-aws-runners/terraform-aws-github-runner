output "pool" {
  description = "Scheduled pool Lambda resources."
  value = {
    lambda    = aws_lambda_function.pool
    log_group = aws_cloudwatch_log_group.pool
    role      = aws_iam_role.pool
  }
}
