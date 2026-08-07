locals {
  provider_environment_variables = {
    scale_up   = local.scale_up_environment_variables
    scale_down = local.scale_down_environment_variables
    pool       = local.pool_environment_variables
  }

  provider_policies = {
    runner = {
      inline_policies     = {}
      managed_policy_arns = {}
    }
    scale_up = {
      iam_policy_json            = data.aws_iam_policy_document.scale_up.json
      additional_iam_policy_json = var.config.iam.additional_policy_json.scale_up
      managed_policy_enabled     = var.config.iam.managed_policy_arns.scale_up != null
      managed_policy_arn         = var.config.iam.managed_policy_arns.scale_up
    }
    scale_down = {
      iam_policy_json = data.aws_iam_policy_document.scale_down.json
    }
    pool = {
      iam_policy_json        = data.aws_iam_policy_document.scale_up.json
      managed_policy_enabled = var.config.iam.managed_policy_arns.pool != null
      managed_policy_arn     = var.config.iam.managed_policy_arns.pool
    }
  }

  provider_resources = {
    image_identifier   = var.config.image_identifier
    image_version      = var.config.image_version
    execution_role_arn = local.execution_role_arn
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
  description = "Provider-specific MicroVM resources exposed by runner-stack."
  value       = local.provider_resources
}

output "assume_role_policy" {
  description = "Lambda MicroVM runner-role trust policy."
  value       = local.assume_role_policy
}

output "provider" {
  description = "Nested Lambda MicroVM compute-provider contract consumed by runner-stack."
  value = {
    environment_variables = local.provider_environment_variables
    policies              = local.provider_policies
    resources             = local.provider_resources
  }
}
