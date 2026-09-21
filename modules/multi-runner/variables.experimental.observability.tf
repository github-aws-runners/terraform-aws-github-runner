# Global observability configuration.
variable "global_config_observability" {
  description = <<-EOT
    Global observability configuration shared by all runner lanes.

    global_config_observability = {
      logs.level: "Log level for module resources."
      logs.retention_in_days: "CloudWatch log retention period in days."
      logs.kms_key_id: "KMS key ID used to encrypt CloudWatch log groups."
      logs.class: "CloudWatch log group class."
      logs.tags: "Tags applied to CloudWatch log groups."
      tracing.mode: "Tracing mode used by instrumented resources."
      tracing.capture_http_requests: "Whether HTTP requests are captured by tracing."
      tracing.capture_error: "Whether errors are captured by tracing."
      metrics.enabled: "Whether module metrics are enabled."
      metrics.namespace: "CloudWatch namespace used for module metrics."
      metrics.metric.github_app_rate_limit.enabled: "Whether GitHub App rate-limit metrics are emitted."
      metrics.metric.job_retry.enabled: "Whether job-retry metrics are emitted."
      metrics.metric.spot_termination_warning.enabled: "Whether spot-termination warning metrics are emitted."
    }
  EOT
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
        github_app_rate_limit = optional(object({
          enabled = optional(bool, true)
        }), {})
        job_retry = optional(object({
          enabled = optional(bool, true)
        }), {})
        spot_termination_warning = optional(object({
          enabled = optional(bool, true)
        }), {})
      }), {})
    }), {})
  })
  default = {}
}
