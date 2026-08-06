# List all non-deprecated role attributes instead of the whole resource to avoid
# "Value derived from a deprecated source" warnings. Only the deprecated
# `managed_policy_arns` and `inline_policy` are omitted.
output "role_pool" {
  value = {
    arn                   = aws_iam_role.pool.arn
    assume_role_policy    = aws_iam_role.pool.assume_role_policy
    create_date           = aws_iam_role.pool.create_date
    description           = aws_iam_role.pool.description
    force_detach_policies = aws_iam_role.pool.force_detach_policies
    id                    = aws_iam_role.pool.id
    max_session_duration  = aws_iam_role.pool.max_session_duration
    name                  = aws_iam_role.pool.name
    name_prefix           = aws_iam_role.pool.name_prefix
    path                  = aws_iam_role.pool.path
    permissions_boundary  = aws_iam_role.pool.permissions_boundary
    tags                  = aws_iam_role.pool.tags
    tags_all              = aws_iam_role.pool.tags_all
    unique_id             = aws_iam_role.pool.unique_id
  }
}

output "lambda" {
  value = aws_lambda_function.pool
}

output "lambda_log_group" {
  value = aws_cloudwatch_log_group.pool
}
