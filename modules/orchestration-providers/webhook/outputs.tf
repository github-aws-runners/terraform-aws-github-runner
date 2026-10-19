output "scale_up" {
  description = "Scale-up control-plane resources."
  value       = module.scale_runners.scale_up
}

output "scale_down" {
  description = "Scale-down control-plane resources."
  value       = module.scale_runners.scale_down
}

output "pool" {
  description = "Scheduled pool resources. Null when no pool schedule is configured."
  value       = one(module.pool[*].pool)
}

output "job_retry" {
  description = "Job-retry resources. Null when job retry is disabled."
  value = local.job_retry_enabled ? {
    lambda = one(module.job_retry[*].lambda)
    queue  = one(module.job_retry[*].job_retry_check_queue)
  } : null
}

output "runner_lifecycle" {
  description = "Effective webhook-owned runner lifecycle consumed by runner-config bootstrap parameters."
  value = {
    ephemeral          = local.resolved_config.runner.ephemeral
    jit_config_enabled = local.resolved_config.runner.jit_config_enabled
  }
}
