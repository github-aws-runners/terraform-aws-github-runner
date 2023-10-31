output "lambda" {
  value = aws_lambda_function.ami_housekeeper
}

output "lambda_log_group" {
  value = aws_cloudwatch_log_group.ami_housekeeper
}

output "lambda_role" {
  value = aws_iam_role.ami_housekeeper
}
