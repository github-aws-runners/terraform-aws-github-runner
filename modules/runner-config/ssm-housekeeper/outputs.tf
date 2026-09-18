output "housekeeper" {
  description = "SSM housekeeper Lambda resources."
  value = {
    lambda    = aws_lambda_function.ssm_housekeeper
    log_group = aws_cloudwatch_log_group.ssm_housekeeper
    role      = aws_iam_role.ssm_housekeeper
  }
}
