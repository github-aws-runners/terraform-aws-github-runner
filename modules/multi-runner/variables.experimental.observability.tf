# Experimental global observability configuration.
variable "experimental_global_config_observability" {
  description = "Experimental global observability configuration."
  type = object({
    logs = optional(object({
      level             = optional(string, "info")
      retention_in_days = optional(number, 180)
      kms_key_id        = optional(string, null)
      class             = optional(string, "STANDARD")
      tags              = optional(map(string), {})
    }), {})
    tracing = optional(object({
      mode                  = optional(string, null)
      capture_http_requests = optional(bool, false)
      capture_error         = optional(bool, false)
    }), {})
    metrics = optional(object({
      enabled   = optional(bool, false)
      namespace = optional(string, "GitHub Runners")
      metric = optional(object({
        github_app_rate_limit_enabled    = optional(bool, true)
        job_retry_enabled                = optional(bool, true)
        spot_termination_enabled         = optional(bool, true)
        spot_termination_warning_enabled = optional(bool, true)
      }), {})
    }), {})
  })
  default = {}
}
