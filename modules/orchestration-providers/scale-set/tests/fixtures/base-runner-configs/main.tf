variable "runner_configs" {
  description = "Base runner configuration fixture forwarded to the scale-set tests."
  type        = any
}

output "runner_configs" {
  description = "Base runner configuration fixture for later test runs."
  value       = var.runner_configs
}
