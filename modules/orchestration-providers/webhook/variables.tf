variable "aws_partition" {
  description = "AWS partition used to construct ARNs."
  type        = string
  default     = "aws"
}

variable "prefix" {
  description = "Prefix used to identify resources created for this webhook orchestration provider."
  type        = string
}

variable "tags" {
  description = "Base tags available to webhook-provider resources. Component-specific tags override this map within their documented scopes."
  type        = map(string)
  default     = {}
}

variable "config" {
  description = <<-EOT
    Provider-owned webhook values supplied from `orchestration.webhook`. The parent resolves inherited input values before calling this module; this provider still resolves the documented JIT, artifact, and tag-precedence fallbacks.

    - `runner`: Runner lifecycle, boot timeout, and capacity settings owned by webhook orchestration.
    - `runner.boot_time_in_minutes`: Expected runner boot duration used by scale-down and pool controls.
    - `runner.ephemeral`: Registers runners in ephemeral mode.
    - `runner.jit_config_enabled`: Explicitly enables or disables just-in-time configuration. Null follows `runner.ephemeral`.
    - `runner.maximum_count`: Maximum number of runners managed for this runner configuration.
    - `github.organization_runners`: Registers runners at organization scope when true; otherwise registration is repository-scoped.
    - `queue.build.arn`: ARN of the runner configuration's build queue.
    - `queue.build.url`: URL of the runner configuration's build queue.
    - `queue.kms_key_id`: Optional KMS key ARN encrypting the build queue. This is independent from the Parameter Store KMS key.
    - `queue.tags`: Tags inherited by queue-related provider resources before component-specific overrides.
    - `lambda.artifact`: Runner-control artifact shared by scale, pool, and job-retry components. At most one of `zip` or `s3` may be selected; no selection uses the packaged runner archive.
    - `lambda.artifact.zip`: Optional local path to the runner-control Lambda archive.
    - `lambda.artifact.s3`: Optional S3 object selector in the common `lambda.artifact.s3.bucket`. Wrapper presence must be known during planning and selecting it requires a non-null common bucket.
    - `lambda.artifact.s3.key`: Object key of the runner-control Lambda archive.
    - `lambda.artifact.s3.object_version`: Optional object version of the runner-control Lambda archive.
    - `lambda.scale.up.memory_size`: Memory allocated to the scale-up Lambda in MB.
    - `lambda.scale.up.timeout`: Scale-up Lambda timeout in seconds.
    - `lambda.scale.up.reserved_concurrent_executions`: Reserved concurrency for scale-up. Use `-1` for unreserved concurrency.
    - `lambda.scale.up.job_queued_check_enabled`: Enables queued-job verification before scaling. Null follows the resolved runner mode.
    - `lambda.scale.up.event_source_mapping.batch_size`: Maximum build-queue records delivered per scale-up invocation.
    - `lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds`: Maximum batching window for build-queue records.
    - `lambda.scale.up.tags`: Tags applied within scale-up resource scopes after common provider tags.
    - `lambda.scale.down.memory_size`: Memory allocated to the scale-down Lambda in MB.
    - `lambda.scale.down.timeout`: Scale-down Lambda timeout in seconds.
    - `lambda.scale.down.schedule_expression`: EventBridge schedule expression that invokes scale-down.
    - `lambda.scale.down.minimum_running_time_in_minutes`: Optional minimum runner age before scale-down may terminate it. Null selects the operating-system default.
    - `lambda.scale.down.idle_config`: Time-based desired idle-runner configurations.
    - `lambda.scale.down.idle_config[].cron`: Cron expression identifying when the idle configuration applies.
    - `lambda.scale.down.idle_config[].timeZone`: IANA time zone used to evaluate the cron expression.
    - `lambda.scale.down.idle_config[].idleCount`: Number of idle runners retained during the matching period.
    - `lambda.scale.down.idle_config[].evictionStrategy`: Selection strategy used when excess idle runners are removed.
    - `lambda.scale.down.tags`: Tags applied within scale-down resource scopes after common provider tags.
    - `lambda.pool.memory_size`: Memory allocated to the pool Lambda in MB.
    - `lambda.pool.timeout`: Pool Lambda timeout in seconds.
    - `lambda.pool.reserved_concurrent_executions`: Reserved concurrency for the pool Lambda. Use `-1` for unreserved concurrency.
    - `lambda.pool.config`: Scheduled target pool sizes. An empty list disables the pool component.
    - `lambda.pool.config[].schedule_expression`: Scheduler expression that activates the target size.
    - `lambda.pool.config[].schedule_expression_timezone`: Optional IANA time zone used to evaluate the schedule.
    - `lambda.pool.config[].size`: Desired number of runners for the schedule.
    - `lambda.pool.include_busy_runners`: Includes busy runners when reconciling scheduled pool capacity.
    - `lambda.pool.runner_owner`: Optional GitHub organization or repository owner used for pooled runners.
    - `lambda.pool.tags`: Tags applied within pool resource scopes after common provider tags.
    - `job_retry.enabled`: Creates the retry queue, Lambda function, event-source mapping, and related IAM resources.
    - `job_retry.delay_in_seconds`: Initial delay before a queued-job retry check.
    - `job_retry.delay_backoff`: Multiplier applied to the delay after each unsuccessful check.
    - `job_retry.max_attempts`: Maximum retry-check attempts before the message is no longer republished.
    - `job_retry.tags`: Tags applied within job-retry resource scopes after common provider tags.
    - `job_retry.lambda.memory_size`: Memory allocated to the job-retry Lambda in MB.
    - `job_retry.lambda.reserved_concurrent_executions`: Reserved concurrency for job retry. Use `-1` for unreserved concurrency.
    - `job_retry.lambda.timeout`: Job-retry Lambda timeout in seconds and visibility timeout for its retry queue.
  EOT
  type = object({
    runner = object({
      boot_time_in_minutes = number
      ephemeral            = bool
      jit_config_enabled   = optional(bool, null)
      maximum_count        = number
    })
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
    lambda = object({
      artifact = object({
        zip = optional(string, null)
        s3 = optional(object({
          key            = string
          object_version = optional(string, null)
        }), null)
      })
      scale = object({
        up = object({
          memory_size                    = number
          timeout                        = number
          reserved_concurrent_executions = number
          job_queued_check_enabled       = optional(bool, null)
          event_source_mapping = object({
            batch_size                         = number
            maximum_batching_window_in_seconds = number
          })
          tags = optional(map(string), {})
        })
        down = object({
          memory_size                     = number
          timeout                         = number
          schedule_expression             = string
          minimum_running_time_in_minutes = optional(number, null)
          idle_config = list(object({
            cron             = string
            timeZone         = string
            idleCount        = number
            evictionStrategy = string
          }))
          tags = optional(map(string), {})
        })
      })
      pool = object({
        memory_size                    = number
        timeout                        = number
        reserved_concurrent_executions = number
        config = list(object({
          schedule_expression          = string
          schedule_expression_timezone = optional(string)
          size                         = number
        }))
        include_busy_runners = bool
        runner_owner         = optional(string, null)
        tags                 = optional(map(string), {})
      })
    })
    job_retry = object({
      enabled          = bool
      delay_in_seconds = number
      delay_backoff    = number
      max_attempts     = number
      tags             = optional(map(string), {})
      lambda = object({
        memory_size                    = number
        reserved_concurrent_executions = number
        timeout                        = number
      })
    })
  })
  nullable = false

  validation {
    condition = !(
      var.config.lambda.artifact.zip != null &&
      var.config.lambda.artifact.s3 != null
    )
    error_message = "config.lambda.artifact must select at most one of zip or s3."
  }
}

variable "runner" {
  description = "Common runner registration values consumed by webhook demand controls. Lifecycle, boot timeout, and capacity remain provider-owned under config.runner."
  type = object({
    os                   = string
    auto_update_disabled = bool
    labels               = list(string)
    group_name           = string
    name_prefix          = string
  })
}

variable "github" {
  description = "Common GitHub API client and GitHub App Parameter Store references."
  type = object({
    app_parameters = object({
      key_base64      = list(map(string))
      id              = list(map(string))
      installation_id = list(object({ name = string, arn = string }))
    })
    enterprise_server = object({
      url        = optional(string, null)
      ssl_verify = bool
    })
    user_agent = optional(string, null)
  })
}

variable "lambda" {
  description = "Common Lambda substrate. Only the shared artifact bucket crosses this boundary; the webhook provider owns its archive key, version, and local zip selection."
  type = object({
    artifact = object({
      s3 = object({
        bucket = optional(string, null)
      })
    })
    runtime            = string
    architecture       = string
    subnet_ids         = list(string)
    security_group_ids = list(string)
    tags               = optional(map(string), {})
    role = object({
      path                 = string
      permissions_boundary = optional(string, null)
      principals = optional(list(object({
        type        = string
        identifiers = list(string)
      })), [])
    })
  })
}

variable "ssm" {
  description = "Resolved Parameter Store paths, optional decrypt key, and runtime parameter tags."
  type = object({
    token_path           = string
    token_path_arn       = string
    config_path          = string
    config_path_arn      = string
    kms_key_id           = optional(string, null)
    parameter_store_tags = string
  })
}

variable "observability" {
  description = "Common logging, tracing, and metrics configuration consumed by webhook controls."
  type = object({
    logs = object({
      level             = string
      retention_in_days = number
      kms_key_id        = optional(string, null)
      class             = string
      tags              = optional(map(string), {})
    })
    tracing = object({
      mode                  = optional(string, null)
      capture_http_requests = bool
      capture_error         = bool
    })
    metrics = object({
      enable    = bool
      namespace = string
      metric = object({
        enable_github_app_rate_limit = bool
        enable_job_retry             = bool
      })
    })
  })
}

variable "runner_provider" {
  description = "Selected compute-provider capabilities consumed by webhook scale-up, scale-down, and pool controls."
  type = object({
    type = string
    scale_up = object({
      environment_variables      = map(string)
      iam_policy_json            = string
      additional_iam_policy_json = optional(string, null)
      managed_policy = optional(object({
        arn = string
      }), null)
    })
    scale_down = object({
      environment_variables = map(string)
      iam_policy_json       = string
    })
    pool = object({
      environment_variables  = map(string)
      iam_policy_json        = string
      managed_policy_enabled = bool
      managed_policy_arn     = optional(string, null)
    })
  })
  nullable = false
}
