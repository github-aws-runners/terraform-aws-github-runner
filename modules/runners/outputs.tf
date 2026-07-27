output "launch_template" {
  value = aws_launch_template.runner
}

# Role outputs list all non-deprecated attributes instead of the whole resource
# to avoid "Value derived from a deprecated source" warnings. Only the deprecated
# `managed_policy_arns` and `inline_policy` are omitted.
output "role_runner" {
  value = [for role in aws_iam_role.runner : {
    arn                   = role.arn
    assume_role_policy    = role.assume_role_policy
    create_date           = role.create_date
    description           = role.description
    force_detach_policies = role.force_detach_policies
    id                    = role.id
    max_session_duration  = role.max_session_duration
    name                  = role.name
    name_prefix           = role.name_prefix
    path                  = role.path
    permissions_boundary  = role.permissions_boundary
    tags                  = role.tags
    tags_all              = role.tags_all
    unique_id             = role.unique_id
  }]
}

output "lambda_scale_up" {
  value = aws_lambda_function.scale_up
}

output "lambda_scale_up_log_group" {
  value = aws_cloudwatch_log_group.scale_up
}

output "role_scale_up" {
  value = {
    arn                   = aws_iam_role.scale_up.arn
    assume_role_policy    = aws_iam_role.scale_up.assume_role_policy
    create_date           = aws_iam_role.scale_up.create_date
    description           = aws_iam_role.scale_up.description
    force_detach_policies = aws_iam_role.scale_up.force_detach_policies
    id                    = aws_iam_role.scale_up.id
    max_session_duration  = aws_iam_role.scale_up.max_session_duration
    name                  = aws_iam_role.scale_up.name
    name_prefix           = aws_iam_role.scale_up.name_prefix
    path                  = aws_iam_role.scale_up.path
    permissions_boundary  = aws_iam_role.scale_up.permissions_boundary
    tags                  = aws_iam_role.scale_up.tags
    tags_all              = aws_iam_role.scale_up.tags_all
    unique_id             = aws_iam_role.scale_up.unique_id
  }
}

output "lambda_scale_down" {
  value = aws_lambda_function.scale_down
}

output "lambda_scale_down_log_group" {
  value = aws_cloudwatch_log_group.scale_down
}

output "role_scale_down" {
  value = {
    arn                   = aws_iam_role.scale_down.arn
    assume_role_policy    = aws_iam_role.scale_down.assume_role_policy
    create_date           = aws_iam_role.scale_down.create_date
    description           = aws_iam_role.scale_down.description
    force_detach_policies = aws_iam_role.scale_down.force_detach_policies
    id                    = aws_iam_role.scale_down.id
    max_session_duration  = aws_iam_role.scale_down.max_session_duration
    name                  = aws_iam_role.scale_down.name
    name_prefix           = aws_iam_role.scale_down.name_prefix
    path                  = aws_iam_role.scale_down.path
    permissions_boundary  = aws_iam_role.scale_down.permissions_boundary
    tags                  = aws_iam_role.scale_down.tags
    tags_all              = aws_iam_role.scale_down.tags_all
    unique_id             = aws_iam_role.scale_down.unique_id
  }
}

output "lambda_pool" {
  value = try(module.pool[0].lambda, null)
}

output "lambda_pool_log_group" {
  value = try(module.pool[0].lambda_log_group, null)
}

output "role_pool" {
  value = try(module.pool[0].role_pool, null)
}

output "runners_log_groups" {
  description = "List of log groups from different log files of runner machine."
  value       = try(aws_cloudwatch_log_group.gh_runners, [])
}

output "logfiles" {
  value       = local.logfiles
  description = "List of logfiles to send to CloudWatch. Object description: `log_group_name`: Name of the log group, `file_path`: path to the log file, `log_stream_name`: name of the log stream."
}
