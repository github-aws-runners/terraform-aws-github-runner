output "environment_variables" {
  description = "Provider-specific Lambda environment variable fragments consumed by runner-config."
  value       = local.provider_environment_variables
}

output "policies" {
  description = "Provider-specific IAM policy fragments consumed by runner-config."
  value       = local.provider_policies
}

output "resources" {
  description = "Provider-specific MicroVM resources exposed by runner-config."
  value       = local.provider_resources
}

output "provider" {
  description = "Nested Lambda MicroVM compute-provider contract consumed by runner-config."
  value = {
    environment_variables = local.provider_environment_variables
    policies              = local.provider_policies
    resources             = local.provider_resources
  }
}
