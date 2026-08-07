output "runner" {
  description = "Common runner resources. The role is null when an external runner role is used."
  value = {
    role = one(aws_iam_role.runner[*])
  }
}

output "scale_up" {
  description = "Scale-up control-plane resources."
  value       = module.scale_runners.scale_up
}

output "scale_down" {
  description = "Scale-down control-plane resources."
  value       = module.scale_runners.scale_down
}

output "pool" {
  description = "Scheduled pool resources. Null when no pool configuration is supplied."
  value       = one(module.pool[*].pool)
}

output "provider" {
  description = "Provider-specific resources grouped under the selected provider key."
  value = {
    (local.provider_type) = local.provider.resources
  }
}
