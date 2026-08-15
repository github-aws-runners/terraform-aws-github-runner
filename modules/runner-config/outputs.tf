output "runner" {
  description = "Common runner resources. The role is null when an external runner role is used."
  value = {
    role = one(aws_iam_role.runner[*])
  }
}

output "scale_up" {
  description = "Scale-up control-plane resources. Null when webhook orchestration is not configured."
  value       = one([for provider in values(module.webhook) : provider.scale_up])
}

output "scale_down" {
  description = "Scale-down control-plane resources. Null when webhook orchestration is not configured."
  value       = one([for provider in values(module.webhook) : provider.scale_down])
}

output "pool" {
  description = "Scheduled pool resources. Null when no pool configuration is supplied."
  value       = one([for provider in values(module.webhook) : provider.pool])
}

output "orchestration" {
  description = "Resources grouped under the selected runner orchestration provider."
  value = {
    webhook = local.orchestration_provider_enabled.webhook ? {
      scale_up   = one([for provider in values(module.webhook) : provider.scale_up])
      scale_down = one([for provider in values(module.webhook) : provider.scale_down])
      pool       = one([for provider in values(module.webhook) : provider.pool])
      job_retry  = one([for provider in values(module.webhook) : provider.job_retry])
    } : null
  }
}

output "provider" {
  description = "Provider-specific resources grouped under the selected provider key."
  value = {
    (local.provider_type) = local.provider_contract.resources
  }
}
