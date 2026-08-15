output "runner" {
  description = "Common runner resources. The role is null when an external runner role is used."
  value = {
    role = one(aws_iam_role.runner[*])
  }
}

output "scale_up" {
  description = "Scale-up control-plane resources. Null when webhook orchestration is not configured."
  value       = one(module.scale_runners[*].scale_up)
}

output "scale_down" {
  description = "Scale-down control-plane resources. Null when webhook orchestration is not configured."
  value       = one(module.scale_runners[*].scale_down)
}

output "pool" {
  description = "Scheduled pool resources. Null when webhook orchestration has no pool configuration."
  value       = one(module.pool[*].pool)
}

output "scale_set" {
  description = "ECS scale-set listener resources. Null when scale-set orchestration is not configured."
  value       = one(module.scale_set_listener[*].listener)
}

output "orchestration" {
  description = "Resources for the selected demand-orchestration provider. Exactly one of webhook or scale_set is non-null."
  value = {
    webhook = local.webhook_enabled ? {
      scale_up   = one(module.scale_runners[*].scale_up)
      scale_down = one(module.scale_runners[*].scale_down)
      pool       = one(module.pool[*].pool)
      job_retry = local.job_retry_enabled ? {
        lambda = one(module.job_retry[*].lambda)
        queue  = one(module.job_retry[*].job_retry_check_queue)
      } : null
    } : null
    scale_set = one(module.scale_set_listener[*].listener)
  }
}

output "provider" {
  description = "Provider-specific resources grouped under the selected provider key."
  value = {
    (local.provider_type) = local.provider_contract.resources
  }
}
