output "environment_variables" {
  description = "Provider-specific Lambda environment variable fragments consumed by runner-config."
  value       = local.provider_environment_variables
}

output "policies" {
  description = "Provider-specific IAM policy fragments consumed by runner-config."
  value       = local.provider_policies
}

output "resources" {
  description = "Provider-specific EC2 resources exposed by runner-config."
  value       = local.provider_resources
}

output "provider" {
  description = "Nested EC2 compute-provider contract consumed by runner-config."
  value = {
    type                  = "ec2"
    capabilities          = { scale_set = local.scale_set_capability }
    environment_variables = local.provider_environment_variables
    policies              = local.provider_policies
    resources             = local.provider_resources
  }
}
