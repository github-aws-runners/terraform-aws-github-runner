output "lambda" {
  value = {
    function  = aws_lambda_function.main
    log_group = aws_cloudwatch_log_group.main
    role      = aws_iam_role.main
  }
}
