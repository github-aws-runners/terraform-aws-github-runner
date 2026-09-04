output "scale_up" {
  description = "Scale-up Lambda resources."
  value = {
    lambda    = aws_lambda_function.scale_up
    log_group = aws_cloudwatch_log_group.scale_up
    role      = aws_iam_role.scale_up
  }
}

output "scale_down" {
  description = "Scale-down Lambda resources."
  value = {
    lambda    = aws_lambda_function.scale_down
    log_group = aws_cloudwatch_log_group.scale_down
    role      = aws_iam_role.scale_down
  }
}
