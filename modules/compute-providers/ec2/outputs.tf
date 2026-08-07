locals {
  provider_environment_variables = {
    scale_up   = local.scale_up_environment_variables
    scale_down = local.scale_down_environment_variables
    pool       = local.pool_environment_variables
  }

  provider_policies = {
    runner = {
      inline_policies     = local.runner_inline_policies
      managed_policy_arns = {}
    }
    scale_up = {
      iam_policy_json            = local.scale_up_iam_policy_json
      additional_iam_policy_json = local.service_linked_role_policy_json
      managed_policy_enabled     = local.ami_id_ssm_external
      managed_policy_arn         = local.ami_id_ssm_external ? aws_iam_policy.ami_id_ssm_parameter_read[0].arn : null
    }
    scale_down = {
      iam_policy_json = local.scale_down_iam_policy_json
    }
    pool = {
      iam_policy_json        = local.pool_iam_policy_json
      managed_policy_enabled = local.ami_id_ssm_external
      managed_policy_arn     = local.ami_id_ssm_external ? aws_iam_policy.ami_id_ssm_parameter_read[0].arn : null
    }
  }

  provider_resources = {
    launch_template    = aws_launch_template.runner
    runners_log_groups = try(aws_cloudwatch_log_group.gh_runners, [])
    logfiles           = local.logfiles
  }
}

output "environment_variables" {
  description = "Provider-specific Lambda environment variable fragments consumed by runner-stack."
  value       = local.provider_environment_variables
}

output "policies" {
  description = "Provider-specific IAM policy fragments consumed by runner-stack."
  value       = local.provider_policies
}

output "resources" {
  description = "Provider-specific EC2 resources exposed by runner-stack."
  value       = local.provider_resources
}

output "assume_role_policy" {
  description = "EC2 runner-role trust policy."
  value       = local.assume_role_policy
}

output "provider" {
  description = "Nested EC2 compute-provider contract consumed by runner-stack."
  value = {
    environment_variables = local.provider_environment_variables
    policies              = local.provider_policies
    resources             = local.provider_resources
  }
}
