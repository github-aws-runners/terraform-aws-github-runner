output "webhook_lambda_function" {
  value = aws_lambda_function.webhook
}


output "webhook" {
  value = {
    lambda    = aws_lambda_function.webhook
    log_group = aws_cloudwatch_log_group.webhook
    # Expose selected role attributes instead of the whole resource to avoid
    # "Value derived from a deprecated source" warnings (managed_policy_arns).
    role = {
      id   = aws_iam_role.webhook_lambda.id
      arn  = aws_iam_role.webhook_lambda.arn
      name = aws_iam_role.webhook_lambda.name
    }
  }
}
