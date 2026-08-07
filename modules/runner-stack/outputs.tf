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
  description = "Selected compute provider type and its provider-specific resources."
  value = {
    type = local.provider.type
    ec2  = local.provider.resources
  }
}
