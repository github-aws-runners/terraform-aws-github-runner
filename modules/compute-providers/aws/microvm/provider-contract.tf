locals {
  provider_environment_variables = {
    scale_up   = local.scale_up_environment_variables
    scale_down = local.scale_down_environment_variables
    pool       = local.pool_environment_variables
  }

  provider_policies = {
    runner = {
      inline_policies     = local.runner_inline_policies
      managed_policy_arns = var.runner.iam.managed_policy_arns
    }
    scale_up = {
      iam_policy_json            = data.aws_iam_policy_document.scale_up.json
      additional_iam_policy_json = var.config.iam.additional_policy_json.scale_up
      managed_policy_enabled     = var.config.iam.managed_policies.scale_up != null
      managed_policy_arn         = try(var.config.iam.managed_policies.scale_up.arn, null)
    }
    scale_down = {
      iam_policy_json = data.aws_iam_policy_document.scale_down.json
    }
    pool = {
      iam_policy_json        = data.aws_iam_policy_document.scale_up.json
      managed_policy_enabled = var.config.iam.managed_policies.pool != null
      managed_policy_arn     = try(var.config.iam.managed_policies.pool.arn, null)
    }
  }

  provider_resources = {
    image_arn          = var.config.image_arn
    image_version      = var.config.image_version
    execution_role_arn = var.runner.iam.role.arn
    runners_log_groups = [aws_cloudwatch_log_group.runtime]
  }
}
