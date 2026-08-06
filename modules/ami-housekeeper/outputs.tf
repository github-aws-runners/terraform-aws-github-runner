output "lambda" {
  value = aws_lambda_function.ami_housekeeper
}

output "lambda_log_group" {
  value = aws_cloudwatch_log_group.ami_housekeeper
}

# List all non-deprecated role attributes instead of the whole resource to avoid
# "Value derived from a deprecated source" warnings. Only the deprecated
# `managed_policy_arns` and `inline_policy` are omitted.
output "lambda_role" {
  value = {
    arn                   = aws_iam_role.ami_housekeeper.arn
    assume_role_policy    = aws_iam_role.ami_housekeeper.assume_role_policy
    create_date           = aws_iam_role.ami_housekeeper.create_date
    description           = aws_iam_role.ami_housekeeper.description
    force_detach_policies = aws_iam_role.ami_housekeeper.force_detach_policies
    id                    = aws_iam_role.ami_housekeeper.id
    max_session_duration  = aws_iam_role.ami_housekeeper.max_session_duration
    name                  = aws_iam_role.ami_housekeeper.name
    name_prefix           = aws_iam_role.ami_housekeeper.name_prefix
    path                  = aws_iam_role.ami_housekeeper.path
    permissions_boundary  = aws_iam_role.ami_housekeeper.permissions_boundary
    tags                  = aws_iam_role.ami_housekeeper.tags
    tags_all              = aws_iam_role.ami_housekeeper.tags_all
    unique_id             = aws_iam_role.ami_housekeeper.unique_id
  }
}
