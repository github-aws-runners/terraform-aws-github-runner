variable "aws_partition" {
  description = "AWS partition used to construct IAM policy ARNs."
  type        = string
  default     = "aws"
}

variable "config" {
  description = <<-EOT
    Provider-neutral scale-up and scale-down configuration assembled by runner-config.

    - `prefix`: Prefix used to name scaling resources.
    - `lambda.artifact.zip`: Resolved local control-plane archive.
    - `lambda.artifact.s3.bucket`: Optional S3 bucket containing the Lambda archive.
    - `lambda.artifact.s3.key`: Object key of the Lambda archive.
    - `lambda.artifact.s3.object_version`: Optional object version of the Lambda archive.
    - `lambda.runtime`: Runtime used by both scaling Lambdas.
    - `lambda.architecture`: Instruction-set architecture used by both scaling Lambdas.
    - `lambda.vpc.subnet_ids`: Subnets used for Lambda VPC configuration.
    - `lambda.vpc.security_group_ids`: Security groups used for Lambda VPC configuration.
    - `lambda.role.path`: IAM path used for the scaling Lambda roles.
    - `lambda.role.permissions_boundary`: Optional permissions boundary for the scaling Lambda roles.
    - `lambda.role.principals`: Additional principals allowed to assume the scaling Lambda roles.
    - `runner.os`: Runner operating system used for the minimum-runtime default.
    - `runner.auto_update_disabled`: Disables the GitHub runner application's built-in updater.
    - `runner.ephemeral`: Registers runners in ephemeral mode.
    - `runner.jit_config_enabled`: Enables or disables just-in-time runner configuration.
    - `runner.labels`: Labels supplied when a runner is registered.
    - `runner.group_name`: GitHub runner group used during registration.
    - `runner.name_prefix`: Prefix added to registered runner names.
    - `runner.boot_time_in_minutes`: Webhook-provider runner boot timeout used by scale-down.
    - `runner.maximum_count`: Webhook-provider runner capacity limit for this runner configuration.
    - `github.organization_runners`: Registers organization runners when true.
    - `github.enterprise_server.url`: Optional GitHub Enterprise Server URL.
    - `github.enterprise_server.ssl_verify`: Enables TLS verification for GitHub Enterprise Server.
    - `github.user_agent`: Optional User-Agent sent to GitHub.
    - `github.app_parameters.key_base64`: Ordered Parameter Store references for GitHub App private keys.
    - `github.app_parameters.id`: Ordered Parameter Store references for GitHub App IDs.
    - `github.app_parameters.installation_id`: Ordered optional Parameter Store references for GitHub App installation IDs.
    - `queue.build.arn`: ARN of the build queue consumed by scale-up.
    - `queue.kms_key_id`: Optional KMS key ARN used to encrypt the build queue. This is distinct from the Parameter Store key.
    - `queue.event_source_mapping.batch_size`: Maximum records delivered per scale-up invocation.
    - `queue.event_source_mapping.maximum_batching_window_in_seconds`: Maximum event batching window.
    - `ssm.token_path`: Parameter Store path used for registration tokens.
    - `ssm.token_path_arn`: ARN of the Parameter Store path used for registration tokens.
    - `ssm.config_path`: Parameter Store path used for persistent runner configuration.
    - `ssm.config_path_arn`: ARN of the persistent runner configuration path.
    - `ssm.kms_key_id`: Optional KMS key ARN used to decrypt shared parameters. Its value may be unknown until apply.
    - `ssm.parameter_store_tags`: JSON-encoded tags applied to parameters created at runtime.
    - `observability.logs`: Shared logging level, retention, encryption, and log-class configuration.
    - `observability.tracing`: Lambda X-Ray and tracing-helper configuration.
    - `observability.metrics`: Metrics enablement, namespace, and GitHub rate-limit metric configuration.
    - `scale_up`: Scale-up Lambda sizing, concurrency, queued-job behavior, and resolved resource tag maps.
    - `scale_up.tags.resources`: Tags for the scale-up IAM role and other component resources.
    - `scale_up.tags.lambda`: Tags for the scale-up Lambda function.
    - `scale_up.tags.log_group`: Tags for the scale-up log group.
    - `scale_up.tags.event_source_mapping`: Tags for the build-queue event-source mapping.
    - `scale_down`: Scale-down Lambda sizing, schedule, idle configuration, minimum runtime, and resolved resource tag maps.
    - `scale_down.tags.resources`: Tags for the scale-down IAM role and EventBridge rule.
    - `scale_down.tags.lambda`: Tags for the scale-down Lambda function.
    - `scale_down.tags.log_group`: Tags for the scale-down log group.
    - `job_retry.enabled`: Enables publishing retry checks from scale-up.
    - `job_retry.queue`: Retry queue ARN and URL. Required when job retry is enabled.
    - `job_retry.max_attempts`: Maximum queued-job retry attempts.
    - `job_retry.delay_in_seconds`: Initial delay before checking the queued job.
    - `job_retry.delay_backoff`: Multiplier applied to subsequent delays.
  EOT

  type = object({
    prefix = string
    lambda = object({
      artifact = object({
        zip = string
        s3 = object({
          bucket         = optional(string, null)
          key            = optional(string, null)
          object_version = optional(string, null)
        })
      })
      runtime      = string
      architecture = string
      vpc = object({
        subnet_ids         = list(string)
        security_group_ids = list(string)
      })
      role = object({
        path                 = string
        permissions_boundary = optional(string, null)
        principals = optional(list(object({
          type        = string
          identifiers = list(string)
        })), [])
      })
    })
    runner = object({
      os                   = string
      auto_update_disabled = bool
      ephemeral            = bool
      jit_config_enabled   = optional(bool, null)
      labels               = list(string)
      group_name           = string
      name_prefix          = string
      boot_time_in_minutes = number
      maximum_count        = number
    })
    github = object({
      organization_runners = bool
      enterprise_server = object({
        url        = optional(string, null)
        ssl_verify = bool
      })
      user_agent = optional(string, null)
      app_parameters = object({
        key_base64      = list(map(string))
        id              = list(map(string))
        installation_id = list(object({ name = string, arn = string }))
      })
    })
    queue = object({
      build = object({
        arn = string
      })
      kms_key_id = optional(string, null)
      event_source_mapping = object({
        batch_size                         = number
        maximum_batching_window_in_seconds = number
      })
    })
    ssm = object({
      token_path           = string
      token_path_arn       = string
      config_path          = string
      config_path_arn      = string
      parameter_store_tags = string
      kms_key_id           = optional(string, null)
    })
    observability = object({
      logs = object({
        level             = string
        retention_in_days = number
        kms_key_id        = optional(string, null)
        class             = string
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
        })
      })
    })
    scale_up = object({
      memory_size                    = number
      timeout                        = number
      reserved_concurrent_executions = number
      job_queued_check_enabled       = bool
      tags = object({
        resources            = map(string)
        lambda               = map(string)
        log_group            = map(string)
        event_source_mapping = map(string)
      })
    })
    scale_down = object({
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
      tags = object({
        resources = map(string)
        lambda    = map(string)
        log_group = map(string)
      })
    })
    job_retry = object({
      enabled          = bool
      max_attempts     = number
      delay_in_seconds = number
      delay_backoff    = number
      queue = optional(object({
        arn = string
        url = string
      }), null)
    })
  })

  nullable = false
}

variable "runner_provider" {
  description = <<-EOT
    Selected compute-provider integration for the scaling control plane.

    - `type`: Compute-provider discriminator supplied to both Lambdas.
    - `scale_up.environment_variables`: Provider-specific scale-up environment variables.
    - `scale_up.iam_policy_json`: Provider-specific IAM policy merged into the common scale-up policy.
    - `scale_up.additional_iam_policy_json`: Optional additional provider policy attached separately to the scale-up role.
    - `scale_up.managed_policy`: Optional provider-managed policy attachment. Object presence controls attachment creation.
    - `scale_up.managed_policy.arn`: ARN of the provider-managed policy. The ARN may remain unknown until apply.
    - `scale_down.environment_variables`: Provider-specific scale-down environment variables.
    - `scale_down.iam_policy_json`: Provider-specific IAM policy merged into the common scale-down policy.
  EOT

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
  })

  nullable = false
}

variable "storage_provider" {
  description = "Opaque storage-provider capabilities for scale-up and scale-down."
  type = object({
    type = string
    scale_up = object({
      environment_variables = map(string)
      iam_policy_json       = optional(string, null)
    })
    scale_down = object({
      environment_variables = map(string)
      iam_policy_json       = optional(string, null)
    })
  })
  default = {
    type = "aws_ssm"
    scale_up = {
      environment_variables = {}
      iam_policy_json       = null
    }
    scale_down = {
      environment_variables = {}
      iam_policy_json       = null
    }
  }
}
