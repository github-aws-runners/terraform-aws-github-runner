output "runner" {
  description = "Common runner resources. The role is null when an external runner role is used."
  value = {
    role = one(aws_iam_role.runner[*])
  }
}

output "scale_up" {
  description = "Scale-up control-plane resources. Null when webhook orchestration is not configured."
  value       = one(module.orchestration_webhook[*].scale_up)
}

output "scale_down" {
  description = "Scale-down control-plane resources. Null when webhook orchestration is not configured."
  value       = one(module.orchestration_webhook[*].scale_down)
}

output "pool" {
  description = "Scheduled pool resources. Null when no pool configuration is supplied."
  value       = one(module.orchestration_webhook[*].pool)
}

output "orchestration_provider" {
  description = "Resources grouped under the selected runner orchestration provider."
  value = {
    webhook = local.orchestration_provider_enabled.webhook ? {
      scale_up   = one(module.orchestration_webhook[*].scale_up)
      scale_down = one(module.orchestration_webhook[*].scale_down)
      pool       = one(module.orchestration_webhook[*].pool)
      job_retry  = one(module.orchestration_webhook[*].job_retry)
    } : null
    scale_set = local.orchestration_provider_enabled.scale_set ? {} : null
  }
}

output "compute_provider_contract" {
  description = "Provider-neutral compute-provider capabilities consumed by topology-level orchestration."
  value = {
    type         = local.provider_contract.type
    capabilities = local.provider_contract.capabilities
  }
}

output "provider" {
  description = "Provider-specific resources grouped under the selected provider namespace and type."
  value = {
    aws = {
      ec2 = local.provider_key == "aws_ec2" ? local.provider_contract.resources : null
    }
  }
}
