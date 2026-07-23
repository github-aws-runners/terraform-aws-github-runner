output "lambda" {
  value = {
    function  = aws_lambda_function.main
    log_group = aws_cloudwatch_log_group.main
    # Expose selected role attributes instead of the whole resource to avoid
    # "Value derived from a deprecated source" warnings (managed_policy_arns).
    role = {
      id   = aws_iam_role.main.id
      arn  = aws_iam_role.main.arn
      name = aws_iam_role.main.name
    }
  }
}
