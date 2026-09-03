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
      enable    = optional(bool, false)
      namespace = optional(string, "GitHub Runners")
      metric = optional(object({
        enable_github_app_rate_limit    = optional(bool, true)
        enable_job_retry                = optional(bool, true)
        enable_spot_termination         = optional(bool, true)
        enable_spot_termination_warning = optional(bool, true)
      }), {})
    }), {})
  })
  default = {}
}
