# Expose selected role attributes instead of the whole resource to avoid
# "Value derived from a deprecated source" warnings (managed_policy_arns).
output "role_pool" {
  value = {
    id   = aws_iam_role.pool.id
    arn  = aws_iam_role.pool.arn
    name = aws_iam_role.pool.name
  }
}

output "lambda" {
  value = aws_lambda_function.pool
}

output "lambda_log_group" {
  value = aws_cloudwatch_log_group.pool
}
