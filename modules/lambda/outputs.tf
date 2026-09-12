output "lambda" {
  value = {
    function  = aws_lambda_function.main
    log_group = aws_cloudwatch_log_group.main
    # Export explicit attributes, not the whole resource, to avoid deprecated-source warnings (#5159).
    role = {
      arn                   = aws_iam_role.main.arn
      assume_role_policy    = aws_iam_role.main.assume_role_policy
      create_date           = aws_iam_role.main.create_date
      description           = aws_iam_role.main.description
      force_detach_policies = aws_iam_role.main.force_detach_policies
      id                    = aws_iam_role.main.id
      max_session_duration  = aws_iam_role.main.max_session_duration
      name                  = aws_iam_role.main.name
      name_prefix           = aws_iam_role.main.name_prefix
      path                  = aws_iam_role.main.path
      permissions_boundary  = aws_iam_role.main.permissions_boundary
      tags                  = aws_iam_role.main.tags
      tags_all              = aws_iam_role.main.tags_all
      unique_id             = aws_iam_role.main.unique_id
    }
  }
}
