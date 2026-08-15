# Typed orchestration-provider input boundary between the common runner configuration and demand controllers.
variable "orchestration" {
  description = <<-EOT
    Runner demand-orchestration provider configuration. Exactly one provider block must be non-null.

    `webhook` is the currently supported provider. It owns the build queue reference, the runner-control
    artifact shared by scale, pool, and job-retry, runner lifecycle and capacity limits, scale-up, scale-down, and scheduled pool
    controls. Wrapper presence selects the provider and must therefore be known during planning. Future
    providers can be added as sibling blocks without moving the webhook contract again.
  EOT
  type = object({
    webhook = optional(object({
      runner = optional(object({
        boot_time_in_minutes = optional(number, 5)
        ephemeral            = optional(bool, false)
        jit_config_enabled   = optional(bool, null)
        maximum_count        = optional(number, 3)
      }), {})
      github = object({
        organization_runners = bool
      })
      queue = object({
        build = object({
          arn = string
          url = string
        })
        kms_key_id = optional(string, null)
        tags       = optional(map(string), {})
      })
      lambda = optional(object({
        artifact = optional(object({
          zip = optional(string, null)
          s3 = optional(object({
            key            = string
            object_version = optional(string, null)
          }), null)
        }), {})
        scale = optional(object({
          up = optional(object({
            memory_size                    = optional(number, 512)
            timeout                        = optional(number, 60)
            reserved_concurrent_executions = optional(number, 1)
            job_queued_check_enabled       = optional(bool, null)
            event_source_mapping = optional(object({
              batch_size                         = optional(number, 10)
              maximum_batching_window_in_seconds = optional(number, 0)
            }), {})
            tags = optional(map(string), {})
          }), {})
          down = optional(object({
            memory_size                     = optional(number, 512)
            timeout                         = optional(number, 60)
            schedule_expression             = optional(string, "cron(*/5 * * * ? *)")
            minimum_running_time_in_minutes = optional(number, null)
            tags                            = optional(map(string), {})
            idle_config = optional(list(object({
              cron             = string
              timeZone         = string
              idleCount        = number
              evictionStrategy = optional(string, "oldest_first")
            })), [])
          }), {})
        }), {})
        pool = optional(object({
          memory_size                    = optional(number, 512)
          timeout                        = optional(number, 60)
          reserved_concurrent_executions = optional(number, 1)
          config = optional(list(object({
            schedule_expression          = string
            schedule_expression_timezone = optional(string)
            size                         = number
          })), [])
          include_busy_runners = optional(bool, false)
          runner_owner         = optional(string, null)
          tags                 = optional(map(string), {})
        }), {})
      }), {})
      job_retry = optional(object({
        enabled          = optional(bool, false)
        delay_in_seconds = optional(number, 300)
        delay_backoff    = optional(number, 2)
        max_attempts     = optional(number, 1)
        tags             = optional(map(string), {})
        lambda = optional(object({
          memory_size                    = optional(number, 256)
          reserved_concurrent_executions = optional(number, 1)
          timeout                        = optional(number, 30)
        }), {})
      }), {})
    }), null)
  })
  nullable = false

  validation {
    condition = length([
      for provider_name, provider_config in var.orchestration : provider_name
      if provider_config != null
    ]) == 1
    error_message = "Exactly one orchestration provider must be configured. Supported providers: webhook."
  }

  validation {
    condition = var.orchestration.webhook == null ? true : (
      var.orchestration.webhook.lambda.scale.up.event_source_mapping.batch_size >= 1 &&
      var.orchestration.webhook.lambda.scale.up.event_source_mapping.batch_size <= 1000 &&
      var.orchestration.webhook.lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds >= 0 &&
      var.orchestration.webhook.lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds <= 300
    )
    error_message = "orchestration.webhook.lambda.scale.up.event_source_mapping batch size must be between 1 and 1000 and its batching window between 0 and 300 seconds."
  }

  validation {
    condition = var.orchestration.webhook == null ? true : !(
      var.orchestration.webhook.lambda.artifact.zip != null &&
      var.orchestration.webhook.lambda.artifact.s3 != null
    )
    error_message = "orchestration.webhook.lambda.artifact must select at most one of zip or s3."
  }

  validation {
    condition     = var.orchestration.webhook == null ? true : (!var.orchestration.webhook.job_retry.enabled || var.orchestration.webhook.job_retry.delay_in_seconds <= 900)
    error_message = "orchestration.webhook.job_retry.delay_in_seconds cannot exceed the SQS maximum of 900 seconds."
  }
}
