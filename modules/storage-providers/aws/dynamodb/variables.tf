variable "prefix" {
  description = "Multi-runner prefix used to name the two shared DynamoDB tables."
  type        = string
}

variable "tags" {
  description = "Base tags added to both shared DynamoDB tables. Table-specific tags override matching keys."
  type        = map(string)
  default     = {}
}

variable "entry_ids" {
  description = "Runner-entry identifiers used to build entry-scoped Lambda capabilities."
  type        = set(string)
}

variable "runner_config_access_scope_prefixes" {
  description = "Per-entry compute-resource scope prefixes used to constrain one-time runner-config writes."
  type        = map(string)
}

variable "runner_config_ttl_seconds" {
  description = "TTL in seconds for one-time registration and JIT configuration records."
  type        = number

  validation {
    condition     = var.runner_config_ttl_seconds > 0 && floor(var.runner_config_ttl_seconds) == var.runner_config_ttl_seconds
    error_message = "runner_config_ttl_seconds must be a positive integer."
  }
}

variable "runner_state_ttl_seconds" {
  description = "Safety TTL in seconds applied only while lifecycle records are provisioning or terminating; active and orphan inventory has no expiry."
  type        = number
}

variable "global_records" {
  description = "Terraform-managed values stored under the shared global scope."
  type = object({
    github_app_credentials = string
    github_webhook_secret  = string
    runner_matcher_config  = string
  })
  sensitive = true
}

variable "entry_records" {
  description = "Resolved durable runner bootstrap configuration keyed by runner-entry identifier."
  type = map(object({
    run_as                 = string
    agent_mode             = string
    disable_default_labels = bool
    enable_jit_config      = bool
  }))
}

variable "config" {
  description = <<-EOT
    Settings for the shared durable configuration table and ephemeral runner-state table.

    - `config.kms_key_arn`: Optional customer-managed KMS key ARN for durable configuration encryption. Null uses the AWS-owned DynamoDB key.
    - `config.point_in_time_recovery_enabled`: Enables point-in-time recovery for durable configuration.
    - `config.deletion_protection_enabled`: Enables deletion protection for the durable table.
    - `config.tags`: Tags applied after the shared tag map.
    - `runner_state.kms_key_arn`: Optional customer-managed KMS key ARN for runner-state encryption. Null uses the AWS-owned DynamoDB key.
    - `runner_state.point_in_time_recovery_enabled`: Enables point-in-time recovery for ephemeral runner state.
    - `runner_state.deletion_protection_enabled`: Enables deletion protection for the runner-state table.
    - `runner_state.tags`: Tags applied after the shared tag map.
  EOT
  type = object({
    config = object({
      kms_key_arn                    = optional(string, null)
      point_in_time_recovery_enabled = optional(bool, true)
      deletion_protection_enabled    = optional(bool, false)
      tags                           = optional(map(string), {})
    })
    runner_state = object({
      kms_key_arn                    = optional(string, null)
      point_in_time_recovery_enabled = optional(bool, false)
      deletion_protection_enabled    = optional(bool, false)
      tags                           = optional(map(string), {})
    })
  })
}
