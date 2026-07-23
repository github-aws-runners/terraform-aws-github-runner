output "lambda" {
  value = aws_lambda_function.ami_housekeeper
}

output "lambda_log_group" {
  value = aws_cloudwatch_log_group.ami_housekeeper
}

# Expose selected role attributes instead of the whole resource to avoid
# "Value derived from a deprecated source" warnings (managed_policy_arns).
output "lambda_role" {
  value = {
    id   = aws_iam_role.ami_housekeeper.id
    arn  = aws_iam_role.ami_housekeeper.arn
    name = aws_iam_role.ami_housekeeper.name
  }
}
