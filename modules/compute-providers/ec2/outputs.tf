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

output "runner_role" {
  description = "Role-independent EC2 runner-role contract consumed before runner-stack creates the role."
  value       = local.provider_runner_role
}

output "provider" {
  description = "Nested EC2 compute-provider contract consumed by runner-stack."
  value = {
    environment_variables = local.provider_environment_variables
    policies              = local.provider_policies
    resources             = local.provider_resources
  }
}
