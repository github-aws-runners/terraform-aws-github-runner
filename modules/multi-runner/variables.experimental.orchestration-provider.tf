# Global orchestration-provider configuration.
variable "global_config_orchestration_provider" {
  description = <<-EOT
    Global orchestration-provider configuration shared by all runner lanes.

    global_config_orchestration_provider = {
      webhook: {
        queue_selection_strategy: "Strategy used to select the build queue for a webhook event."
        eventbridge.enabled: "Whether EventBridge integration is enabled for webhook events."
        eventbridge.accept_events: "Event types accepted by the EventBridge integration."
        matcher_config_parameter_store_tier: "SSM Parameter Store tier used for matcher configuration."
        runner.boot_time_in_minutes: "Expected runner boot time used by orchestration."
        runner.ephemeral: "Whether runners created by the orchestration provider are ephemeral."
        runner.jit_config_enabled: "Whether JIT runner configuration is enabled."
        runner.maximum_count: "Maximum number of runners that orchestration may create."
        github.repository_white_list: "Repositories allowed to use the webhook configuration."
        lambda.artifact.zip: "Local ZIP artifact used for orchestration Lambda functions."
        lambda.artifact.s3.key: "S3 object key for the orchestration Lambda artifact."
        lambda.artifact.s3.object_version: "Optional S3 object version for the orchestration Lambda artifact."
        lambda.scale.up.memory_size: "Memory allocated to the scale-up Lambda."
        lambda.scale.up.timeout: "Timeout in seconds for the scale-up Lambda."
        lambda.scale.up.reserved_concurrent_executions: "Reserved concurrent executions for the scale-up Lambda."
        lambda.scale.up.job_queued_check_enabled: "Whether the scale-up Lambda checks queued jobs."
        lambda.scale.up.event_source_mapping.batch_size: "Maximum records passed to one scale-up Lambda invocation."
        lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds: "Maximum time to batch records before invoking the scale-up Lambda."
        lambda.scale.up.tags: "Tags applied to the scale-up Lambda."
        lambda.scale.down.memory_size: "Memory allocated to the scale-down Lambda."
        lambda.scale.down.timeout: "Timeout in seconds for the scale-down Lambda."
        lambda.scale.down.schedule_expression: "Schedule expression for scale-down processing."
        lambda.scale.down.minimum_running_time_in_minutes: "Minimum runner lifetime before scale-down."
        lambda.scale.down.idle_confirmation_seconds: "Seconds a runner must consistently report not-busy before scale-down terminates it; 0 disables the confirmation window."
        lambda.scale.down.idle_config: "Scheduled minimum idle-runner pool settings."
        lambda.scale.down.idle_config.cron: "Cron expression defining when the idle-runner count applies."
        lambda.scale.down.idle_config.timeZone: "Time zone used to evaluate the idle-runner schedule."
        lambda.scale.down.idle_config.idleCount: "Minimum number of idle runners maintained during the schedule."
        lambda.scale.down.idle_config.evictionStrategy: "Strategy used when evicting idle runners."
        lambda.scale.down.tags: "Tags applied to the scale-down Lambda."
        lambda.webhook.artifact.zip: "Local ZIP artifact used for the webhook Lambda."
        lambda.webhook.artifact.s3.key: "S3 object key for the webhook Lambda artifact."
        lambda.webhook.artifact.s3.object_version: "Optional S3 object version for the webhook Lambda artifact."
        lambda.webhook.api_gateway_access_log_settings: "API Gateway access-log destination and format."
        lambda.webhook.api_gateway_access_log_settings.destination_arn: "ARN of the API Gateway access-log destination."
        lambda.webhook.api_gateway_access_log_settings.format: "API Gateway access-log format."
        lambda.webhook.memory_size: "Memory allocated to the webhook Lambda."
        lambda.webhook.timeout: "Timeout in seconds for the webhook Lambda."
        lambda.webhook.tags: "Tags applied to the webhook Lambda."
        lambda.pool.memory_size: "Memory allocated to the pool Lambda."
        lambda.pool.timeout: "Timeout in seconds for the pool Lambda."
        lambda.pool.reserved_concurrent_executions: "Reserved concurrent executions for the pool Lambda."
        lambda.pool.config: "Scheduled runner-pool size configuration."
        lambda.pool.config.schedule_expression: "Schedule expression for the pool size."
        lambda.pool.config.schedule_expression_timezone: "Time zone used to evaluate the pool schedule."
        lambda.pool.config.size: "Runner pool size applied by the schedule."
        lambda.pool.include_busy_runners: "Whether busy runners are included in pool sizing."
        lambda.pool.runner_owner: "GitHub organization that owns the runner pool."
        lambda.pool.tags: "Tags applied to the pool Lambda."
        queue.delay_webhook_event: "Seconds a webhook event remains invisible in the build queue before processing."
        queue.job_queue_retention_in_seconds: "Seconds a queued job is retained before it is purged."
        queue.visibility_timeout_seconds: "Build queue visibility timeout in seconds."
        queue.redrive_build_queue.enabled: "Whether the build queue dead-letter queue is enabled."
        queue.redrive_build_queue.maxReceiveCount: "Maximum receives before a message is moved to the dead-letter queue."
        queue.tags: "Tags applied to build queues."
        queue.encryption.kms_data_key_reuse_period_seconds: "KMS data-key reuse period for queue encryption."
        queue.encryption.kms_master_key_id: "KMS key ID used for queue encryption."
        queue.encryption.sqs_managed_sse_enabled: "Whether SQS-managed server-side encryption is enabled."
      }
    }
  EOT
  type = object({
    webhook = optional(object({
      queue_selection_strategy = optional(string, "first")
      eventbridge = optional(object({
        enabled       = optional(bool, true)
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
            idle_confirmation_seconds       = optional(number, 0)
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
