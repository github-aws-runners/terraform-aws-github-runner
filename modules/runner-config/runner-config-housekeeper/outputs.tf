output "housekeeper" {
  description = "Runner-config housekeeper Lambda resources."
  value = {
    lambda    = aws_lambda_function.housekeeper
    log_group = aws_cloudwatch_log_group.housekeeper
    role      = aws_iam_role.housekeeper
  }
}
