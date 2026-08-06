output "eventbridge" {
  value = {
    event_bus = aws_cloudwatch_event_bus.main
    archive   = aws_cloudwatch_event_archive.main
  }
}

output "webhook" {
  value = {
    lambda    = aws_lambda_function.webhook
    log_group = aws_cloudwatch_log_group.webhook
    # List all non-deprecated role attributes instead of the whole resource to
    # avoid "Value derived from a deprecated source" warnings. Only the deprecated
    # `managed_policy_arns` and `inline_policy` are omitted.
    role = {
      arn                   = aws_iam_role.webhook_lambda.arn
      assume_role_policy    = aws_iam_role.webhook_lambda.assume_role_policy
      create_date           = aws_iam_role.webhook_lambda.create_date
      description           = aws_iam_role.webhook_lambda.description
      force_detach_policies = aws_iam_role.webhook_lambda.force_detach_policies
      id                    = aws_iam_role.webhook_lambda.id
      max_session_duration  = aws_iam_role.webhook_lambda.max_session_duration
      name                  = aws_iam_role.webhook_lambda.name
      name_prefix           = aws_iam_role.webhook_lambda.name_prefix
      path                  = aws_iam_role.webhook_lambda.path
      permissions_boundary  = aws_iam_role.webhook_lambda.permissions_boundary
      tags                  = aws_iam_role.webhook_lambda.tags
      tags_all              = aws_iam_role.webhook_lambda.tags_all
      unique_id             = aws_iam_role.webhook_lambda.unique_id
    }
  }
}

output "dispatcher" {
  value = {
    lambda    = aws_lambda_function.dispatcher
    log_group = aws_cloudwatch_log_group.dispatcher
    role = {
      arn                   = aws_iam_role.dispatcher_lambda.arn
      assume_role_policy    = aws_iam_role.dispatcher_lambda.assume_role_policy
      create_date           = aws_iam_role.dispatcher_lambda.create_date
      description           = aws_iam_role.dispatcher_lambda.description
      force_detach_policies = aws_iam_role.dispatcher_lambda.force_detach_policies
      id                    = aws_iam_role.dispatcher_lambda.id
      max_session_duration  = aws_iam_role.dispatcher_lambda.max_session_duration
      name                  = aws_iam_role.dispatcher_lambda.name
      name_prefix           = aws_iam_role.dispatcher_lambda.name_prefix
      path                  = aws_iam_role.dispatcher_lambda.path
      permissions_boundary  = aws_iam_role.dispatcher_lambda.permissions_boundary
      tags                  = aws_iam_role.dispatcher_lambda.tags
      tags_all              = aws_iam_role.dispatcher_lambda.tags_all
      unique_id             = aws_iam_role.dispatcher_lambda.unique_id
    }
  }
}
