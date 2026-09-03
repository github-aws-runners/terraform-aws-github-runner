# Experimental global orchestration-provider configuration.
variable "experimental_global_config_orchestration_provider" {
  description = "Experimental global orchestration-provider configuration."
  type = object({
    webhook = optional(object({
      queue_selection_strategy = optional(string, "first")
      eventbridge = optional(object({
        enable        = optional(bool, true)
        accept_events = optional(list(string), [])
      }), {})
      matcher_config_parameter_store_tier = optional(string, "Standard")
      runner = optional(object({
        boot_time_in_minutes = optional(number, 5)
        ephemeral            = optional(bool, false)
        jit_config_enabled   = optional(bool, null)
        maximum_count        = optional(number, null)
      }), {})

      github = optional(object({
        repository_white_list = optional(list(string), [])
      }), {})

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
            timeout                        = optional(number, 30)
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
            idle_config = optional(list(object({
              cron             = string
              timeZone         = string
              idleCount        = number
              evictionStrategy = optional(string, "oldest_first")
            })), [])
            tags = optional(map(string), {})
          }), {})
        }), {})
        webhook = optional(object({
          artifact = optional(object({
            zip = optional(string, null)
            s3 = optional(object({
              key            = string
              object_version = optional(string, null)
            }), null)
          }), {})
          api_gateway_access_log_settings = optional(object({
            destination_arn = string
            format          = string
          }), null)
          memory_size = optional(number, 256)
          timeout     = optional(number, 10)
          tags        = optional(map(string), {})
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

      queue = optional(object({
        delay_webhook_event            = optional(number, 30)
        job_queue_retention_in_seconds = optional(number, 86400)
        visibility_timeout_seconds     = optional(number, 180)
        redrive_build_queue = optional(object({
          enabled         = optional(bool, false)
          maxReceiveCount = optional(number, null)
          }), {
          enabled         = false
          maxReceiveCount = null
        })
        tags = optional(map(string), {})
        encryption = optional(object({
          kms_data_key_reuse_period_seconds = number
          kms_master_key_id                 = string
          sqs_managed_sse_enabled           = bool
          }), {
          kms_data_key_reuse_period_seconds = null
          kms_master_key_id                 = null
          sqs_managed_sse_enabled           = true
        })
      }), {})
    }), {})
  })
  default = {}
}
