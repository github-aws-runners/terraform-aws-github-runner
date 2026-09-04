# Typed orchestration-provider input boundary between the common runner configuration and demand controllers.
variable "orchestration_provider" {
  description = <<-EOT
    Runner demand-orchestration provider configuration. Exactly one provider block must be non-null. Wrapper presence selects the provider and must therefore be known during planning; values inside the selected provider may remain unknown until apply.

    - `webhook`: Selects the workflow-job webhook control plane. It owns runner lifecycle and capacity, the build queue reference, the runner-control artifact, scale-up, scale-down, scheduled pool, and optional job-retry controls.
    - `scale_set`: Selects scale-set orchestration for this runner config. The multi-runner topology owns the shared controller service and passes this plan-known selection marker to runner-config. Scale-set runners always use ephemeral JIT registration.
    - `webhook.runner`: Runner lifecycle, boot timeout, and capacity settings owned by webhook orchestration.
    - `webhook.runner.boot_time_in_minutes`: Expected runner boot duration used by scale-down and pool controls. The default is `5`.
    - `webhook.runner.ephemeral`: Registers runners in ephemeral mode. The default is `false`.
    - `webhook.runner.jit_config_enabled`: Explicitly enables or disables just-in-time configuration. The default is null, which follows `runner.ephemeral`.
    - `webhook.runner.maximum_count`: Maximum number of runners managed for this runner configuration. The default is `3`.
    - `webhook.github.organization_runners`: Registers runners at organization scope when true; otherwise registration is repository-scoped.
    - `webhook.queue.build.arn`: ARN of the runner configuration's build queue.
    - `webhook.queue.build.url`: URL of the runner configuration's build queue.
    - `webhook.queue.kms_key_id`: Optional KMS key ARN encrypting the build queue. The default is null and is independent from the Parameter Store KMS key.
    - `webhook.queue.tags`: Tags inherited by queue-related provider resources before component-specific overrides. The default is `{}`.
    - `webhook.lambda.artifact`: Runner-control artifact shared by scale, pool, and job-retry components. Set at most one of `zip` or `s3`; no selection uses the packaged runner archive.
    - `webhook.lambda.artifact.zip`: Optional local path to the runner-control Lambda archive. The default is null.
    - `webhook.lambda.artifact.s3`: Optional S3 object selector in the common `lambda.artifact.s3.bucket`. Wrapper presence must be known during planning, selecting it requires a non-null common bucket, and the default is null.
    - `webhook.lambda.artifact.s3.key`: Object key of the runner-control Lambda archive.
    - `webhook.lambda.artifact.s3.object_version`: Optional object version of the runner-control Lambda archive. The default is null.
    - `webhook.lambda.scale.up.memory_size`: Memory allocated to the scale-up Lambda in MB. The default is `512`.
    - `webhook.lambda.scale.up.timeout`: Scale-up Lambda timeout in seconds. The default is `60`.
    - `webhook.lambda.scale.up.reserved_concurrent_executions`: Reserved concurrency for scale-up. The default is `1`; use `-1` for unreserved concurrency.
    - `webhook.lambda.scale.up.job_queued_check_enabled`: Enables queued-job verification before scaling. The default is null, which follows the resolved runner mode.
    - `webhook.lambda.scale.up.event_source_mapping.batch_size`: Maximum build-queue records delivered per scale-up invocation. The default is `10`.
    - `webhook.lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds`: Maximum batching window for build-queue records. The default is `0`.
    - `webhook.lambda.scale.up.tags`: Tags applied within scale-up resource scopes after common provider tags. The default is `{}`.
    - `webhook.lambda.scale.down.memory_size`: Memory allocated to the scale-down Lambda in MB. The default is `512`.
    - `webhook.lambda.scale.down.timeout`: Scale-down Lambda timeout in seconds. The default is `60`.
    - `webhook.lambda.scale.down.schedule_expression`: EventBridge schedule expression that invokes scale-down. The default is `cron(*/5 * * * ? *)`.
    - `webhook.lambda.scale.down.minimum_running_time_in_minutes`: Optional minimum runner age before scale-down may terminate it. The default is null, which selects the operating-system default.
    - `webhook.lambda.scale.down.idle_config`: Time-based desired idle-runner configurations. The default is `[]`.
    - `webhook.lambda.scale.down.idle_config[].cron`: Cron expression identifying when the idle configuration applies.
    - `webhook.lambda.scale.down.idle_config[].timeZone`: IANA time zone used to evaluate the cron expression.
    - `webhook.lambda.scale.down.idle_config[].idleCount`: Number of idle runners retained during the matching period.
    - `webhook.lambda.scale.down.idle_config[].evictionStrategy`: Selection strategy used when excess idle runners are removed. The default is `oldest_first`.
    - `webhook.lambda.scale.down.tags`: Tags applied within scale-down resource scopes after common provider tags. The default is `{}`.
    - `webhook.lambda.pool.memory_size`: Memory allocated to the pool Lambda in MB. The default is `512`.
    - `webhook.lambda.pool.timeout`: Pool Lambda timeout in seconds. The default is `60`.
    - `webhook.lambda.pool.reserved_concurrent_executions`: Reserved concurrency for the pool Lambda. The default is `1`; use `-1` for unreserved concurrency.
    - `webhook.lambda.pool.config`: Scheduled target pool sizes. The default is `[]`, which disables the pool component.
    - `webhook.lambda.pool.config[].schedule_expression`: Scheduler expression that activates the target size.
    - `webhook.lambda.pool.config[].schedule_expression_timezone`: Optional IANA time zone used to evaluate the schedule.
    - `webhook.lambda.pool.config[].size`: Desired number of runners for the schedule.
    - `webhook.lambda.pool.include_busy_runners`: Includes busy runners when reconciling scheduled pool capacity. The default is `false`.
    - `webhook.lambda.pool.runner_owner`: Optional GitHub organization or repository owner used for pooled runners. The default is null.
    - `webhook.lambda.pool.tags`: Tags applied within pool resource scopes after common provider tags. The default is `{}`.
    - `webhook.job_retry.enabled`: Creates the retry queue, Lambda function, event-source mapping, and related IAM resources. The default is `false`.
    - `webhook.job_retry.delay_in_seconds`: Initial delay before a queued-job retry check. The default is `300`.
    - `webhook.job_retry.delay_backoff`: Multiplier applied to the delay after each unsuccessful check. The default is `2`.
    - `webhook.job_retry.max_attempts`: Maximum retry-check attempts before the message is no longer republished. The default is `1`.
    - `webhook.job_retry.tags`: Tags applied within job-retry resource scopes after common provider tags. The default is `{}`.
    - `webhook.job_retry.lambda.memory_size`: Memory allocated to the job-retry Lambda in MB. The default is `256`.
    - `webhook.job_retry.lambda.reserved_concurrent_executions`: Reserved concurrency for job retry. The default is `1`; use `-1` for unreserved concurrency.
    - `webhook.job_retry.lambda.timeout`: Job-retry Lambda timeout in seconds and visibility timeout for its retry queue. The default is `30`.
    - `scale_set`: Selects scale-set orchestration for this runner configuration.
    - `scale_set.github.config_url`: GitHub Actions scale-set configuration URL.
    - `scale_set.github.installation_id_ssm`: SSM parameter containing the GitHub App installation ID.
    - `scale_set.name`: Name of the scale set.
    - `scale_set.id`: Numeric scale-set ID.
    - `scale_set.runner_group_id`: Optional GitHub runner-group ID.
    - `scale_set.min_runners`: Minimum number of scale-set runners. The default is `0`.
    - `scale_set.max_runners`: Maximum number of scale-set runners. The default is `10`.
    - `scale_set.boot_time_in_minutes`: Expected scale-set runner boot duration. The default is `10`.
    - `scale_set.session_owner`: Optional owner for scale-set runner sessions.
    - `scale_set.work_folder`: Optional runner work folder.
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
            idle_config = optional(list(object({
              cron             = string
              timeZone         = string
              idleCount        = number
              evictionStrategy = optional(string, "oldest_first")
            })), [])
            tags = optional(map(string), {})
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
    scale_set = optional(object({
      github = object({
        config_url = string
        installation_id_ssm = object({
          name        = string
          arn         = string
          kms_key_arn = optional(string, null)
        })
        force_ghes = optional(bool, null)
      })
      name                 = string
      id                   = number
      runner_group_id      = optional(number, null)
      min_runners          = optional(number, 0)
      max_runners          = optional(number, 10)
      boot_time_in_minutes = optional(number, 10)
      session_owner        = optional(string, null)
      work_folder          = optional(string, null)
    }), null)
  })
  nullable = false

}
