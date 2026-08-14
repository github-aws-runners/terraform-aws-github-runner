variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "aws_partition" {
  description = "AWS partition used to construct ARNs."
  type        = string
  default     = "aws"
}

variable "prefix" {
  description = "The prefix used for naming resources."
  type        = string
  default     = "github-actions"
}

variable "tags" {
  description = "Base tags added to taggable resources created by this stack. Shared, component, and compute-provider tag maps override matching keys within their documented resource scopes."
  type        = map(string)
  default     = {}
}

variable "runner" {
  description = <<-EOT
    Provider-neutral GitHub runner configuration.

    - `os`: Runner operating system. Supported values are `linux`, `osx`, and `windows`.
    - `architecture`: Runner distribution architecture, such as `x64` or `arm64`.
    - `boot_time_in_minutes`: Expected instance boot duration used before a runner is considered stale.
    - `disable_default_labels`: Prevents GitHub's default self-hosted, operating-system, and architecture labels from being registered.
    - `labels`: Complete set of labels supplied to the control-plane functions.
    - `group_name`: GitHub runner group used during registration.
    - `name_prefix`: Prefix added to registered runner names.
    - `run_as_root`: Runs the runner service as root when supported by the compute provider.
    - `run_as`: Operating-system user used when `run_as_root` is false.
    - `maximum_count`: Maximum number of runners that may exist for this stack.
    - `ephemeral`: Registers runners in ephemeral mode.
    - `jit_config_enabled`: Explicitly enables or disables just-in-time configuration. When null, runtime behavior follows `ephemeral`.
    - `auto_update_disabled`: Disables the GitHub runner application's built-in updater.
    - `tags`: Additional tags for common runner resources, currently the managed runner IAM role. These override module-level `tags` with the same key.
    - `hooks.job_started`: Script content installed as the runner job-started hook.
    - `hooks.job_completed`: Script content installed as the runner job-completed hook.
    - `iam.role.arn`: ARN of an externally managed runner role. When set, this module does not create or modify that role.
    - `iam.managed_policy_arns`: Named managed-policy ARNs attached to the module-managed runner role.
    - `iam.additional_trust_policy_json`: Optional IAM policy document merged with the selected compute provider's default runner-role trust policy.
    - `iam.path`: IAM path for the module-managed runner role. Defaults to a path derived from `prefix`.
    - `iam.permissions_boundary`: Permissions-boundary ARN for the module-managed runner role.
  EOT
  type = object({
    os                     = optional(string, "linux")
    architecture           = optional(string, "x64")
    boot_time_in_minutes   = optional(number, 5)
    disable_default_labels = optional(bool, false)
    labels                 = list(string)
    group_name             = optional(string, "Default")
    name_prefix            = optional(string, "")
    run_as_root            = optional(bool, false)
    run_as                 = optional(string, "ec2-user")
    maximum_count          = optional(number, 3)
    ephemeral              = optional(bool, false)
    jit_config_enabled     = optional(bool, null)
    auto_update_disabled   = optional(bool, false)
    tags                   = optional(map(string), {})
    hooks = optional(object({
      job_started   = optional(string, "")
      job_completed = optional(string, "")
    }), {})
    iam = optional(object({
      role = optional(object({
        arn = string
      }), null)
      managed_policy_arns          = optional(map(string), {})
      additional_trust_policy_json = optional(string, null)
      path                         = optional(string, null)
      permissions_boundary         = optional(string, null)
    }), {})
  })

  validation {
    condition     = contains(["linux", "osx", "windows"], var.runner.os)
    error_message = "Valid values for runner.os are linux, osx, and windows."
  }

  validation {
    condition     = length(var.runner.name_prefix) <= 45
    error_message = "runner.name_prefix must be at most 45 characters."
  }

  validation {
    condition     = var.runner.iam.role == null ? true : trimspace(var.runner.iam.role.arn) != ""
    error_message = "runner.iam.role.arn must be a non-empty ARN when set."
  }

  validation {
    condition     = var.runner.iam.role == null || length(var.runner.iam.managed_policy_arns) == 0
    error_message = "runner.iam.managed_policy_arns cannot be set with an external runner.iam.role because external roles are not managed by this module."
  }

  validation {
    condition     = var.runner.iam.additional_trust_policy_json == null ? true : can(jsondecode(var.runner.iam.additional_trust_policy_json))
    error_message = "runner.iam.additional_trust_policy_json must be valid JSON when set."
  }

  validation {
    condition     = var.runner.iam.role == null || var.runner.iam.additional_trust_policy_json == null
    error_message = "runner.iam.additional_trust_policy_json cannot be set with an external runner.iam.role because external role trust is not managed by this module."
  }
}

variable "github" {
  description = <<-EOT
    GitHub API and runner-registration configuration.

    - `app_parameters.key_base64`: Ordered Parameter Store references for GitHub App private keys.
    - `app_parameters.id`: Ordered Parameter Store references for GitHub App IDs.
    - `app_parameters.installation_id`: Ordered optional Parameter Store references for GitHub App installation IDs.
    - `organization_runners`: Registers runners at organization scope when true; otherwise repository-scoped registration is used.
    - `enterprise_server.url`: Optional GitHub Enterprise Server base URL. Null selects GitHub.com.
    - `enterprise_server.ssl_verify`: Enables TLS certificate verification for GitHub Enterprise Server requests.
    - `user_agent`: Optional User-Agent value added to GitHub API requests.
  EOT
  type = object({
    app_parameters = object({
      key_base64      = list(map(string))
      id              = list(map(string))
      installation_id = list(object({ name = string, arn = string }))
    })
    organization_runners = bool
    enterprise_server = optional(object({
      url        = optional(string, null)
      ssl_verify = optional(bool, true)
    }), {})
    user_agent = optional(string, null)
  })
}

variable "queue" {
  description = <<-EOT
    Build queue reference and queue-integrated Lambda configuration.

    - `build.arn`: ARN of the externally managed build queue consumed by scale-up.
    - `build.url`: URL of the externally managed build queue used when messages are published.
    - `event_source_mapping.batch_size`: Maximum records delivered to a Lambda invocation.
    - `event_source_mapping.maximum_batching_window_in_seconds`: Maximum time Lambda may buffer records before invocation.
    - `tags`: Shared tags for queue-related resources created by this stack, including event-source mappings and the optional job-retry queue. These override module-level `tags`; component `tags` override this map when keys conflict. The referenced build queue is not managed or tagged by this module.
  EOT
  type = object({
    build = object({
      arn = string
      url = string
    })
    event_source_mapping = optional(object({
      batch_size                         = optional(number, 10)
      maximum_batching_window_in_seconds = optional(number, 0)
    }), {})
    tags = optional(map(string), {})
  })

  validation {
    condition     = var.queue.event_source_mapping.batch_size >= 1 && var.queue.event_source_mapping.batch_size <= 1000
    error_message = "queue.event_source_mapping.batch_size must be between 1 and 1000."
  }

  validation {
    condition     = var.queue.event_source_mapping.maximum_batching_window_in_seconds >= 0 && var.queue.event_source_mapping.maximum_batching_window_in_seconds <= 300
    error_message = "queue.event_source_mapping.maximum_batching_window_in_seconds must be between 0 and 300."
  }
}

variable "lambda" {
  description = <<-EOT
    Configuration shared by the control-plane Lambda functions.

    - `zip`: Local control-plane archive. When null, the module's packaged runner archive is used.
    - `s3.bucket`: Optional S3 bucket containing the Lambda archive. Setting this selects S3 instead of a local archive.
    - `s3.key`: Object key of the Lambda archive in `s3.bucket`.
    - `s3.object_version`: Optional version of the Lambda archive object.
    - `runtime`: Runtime used by all control-plane Lambda functions.
    - `architecture`: Instruction-set architecture used by all control-plane Lambda functions. Supported values are `arm64` and `x86_64`.
    - `subnet_ids`: Subnets used for Lambda VPC configuration.
    - `security_group_ids`: Security groups used for Lambda VPC configuration.
    - `tags`: Shared tags applied to Lambda function resources only. These override module-level `tags`; component `tags` override this map when keys conflict.
    - `role.path`: IAM path for module-managed Lambda execution roles. Defaults to a path derived from `prefix`.
    - `role.permissions_boundary`: Permissions-boundary ARN applied to module-managed Lambda execution roles.
  EOT
  type = object({
    zip = optional(string, null)
    s3 = optional(object({
      bucket         = optional(string, null)
      key            = optional(string, null)
      object_version = optional(string, null)
    }), {})
    runtime            = optional(string, "nodejs24.x")
    architecture       = optional(string, "arm64")
    subnet_ids         = optional(list(string), [])
    security_group_ids = optional(list(string), [])
    tags               = optional(map(string), {})
    role = optional(object({
      path                 = optional(string, null)
      permissions_boundary = optional(string, null)
    }), {})
  })
  default = {}

  validation {
    condition     = contains(["arm64", "x86_64"], var.lambda.architecture)
    error_message = "lambda.architecture must be arm64 or x86_64."
  }
}

variable "scale_up" {
  description = <<-EOT
    Scale-up component configuration.

    - `memory_size`: Memory allocated to the scale-up Lambda in MB.
    - `timeout`: Scale-up Lambda timeout in seconds.
    - `reserved_concurrent_executions`: Reserved concurrency for the scale-up Lambda. Use `-1` for unreserved concurrency.
    - `job_queued_check_enabled`: Enables the queued-job verification before scaling. When null, the default is enabled for persistent runners and disabled for ephemeral runners.
    - `tags`: Tags for scale-up resources, including the Lambda function, log group, event-source mapping, and IAM role. These override module-level tags and the shared `lambda.tags`, `queue.tags`, and `observability.logs.tags` maps when keys conflict.
  EOT
  type = object({
    memory_size                    = optional(number, 512)
    timeout                        = optional(number, 60)
    reserved_concurrent_executions = optional(number, 1)
    job_queued_check_enabled       = optional(bool, null)
    tags                           = optional(map(string), {})
  })
  default = {}
}

variable "scale_down" {
  description = <<-EOT
    Scale-down Lambda, schedule, and idle-runner configuration.

    - `memory_size`: Memory allocated to the scale-down Lambda in MB.
    - `timeout`: Scale-down Lambda timeout in seconds.
    - `schedule_expression`: EventBridge schedule expression that invokes scale-down.
    - `minimum_running_time_in_minutes`: Minimum runner age before scale-down may terminate it. Null selects the operating-system default.
    - `tags`: Tags for scale-down resources, including the Lambda function, log group, EventBridge rule, and IAM role. These override module-level tags and the shared `lambda.tags` and `observability.logs.tags` maps when keys conflict.
    - `idle_config`: Time-based desired idle-runner configurations.
    - `idle_config[].cron`: Cron expression identifying when the configuration applies.
    - `idle_config[].timeZone`: IANA time zone used to evaluate `cron`.
    - `idle_config[].idleCount`: Number of idle runners to retain during the matching period.
    - `idle_config[].evictionStrategy`: Selection strategy used when excess idle runners are removed.
  EOT
  type = object({
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
  })
  default = {}
}

variable "pool" {
  description = <<-EOT
    Scheduled runner-pool configuration. The pool component is created only when `config` is non-empty.

    - `config`: Scheduled target pool sizes.
    - `config[].schedule_expression`: Scheduler expression that activates the target size.
    - `config[].schedule_expression_timezone`: Optional IANA time zone used to evaluate the schedule.
    - `config[].size`: Desired number of runners for the schedule.
    - `include_busy_runners`: Includes busy runners when calculating the current pool size.
    - `runner_owner`: Optional GitHub organization or repository owner used when creating pooled runners.
    - `tags`: Tags for pool resources, including the Lambda function, log group, IAM roles, and scheduler group. These override module-level tags and the shared `lambda.tags` and `observability.logs.tags` maps when keys conflict.
    - `lambda.memory_size`: Memory allocated to the pool Lambda in MB.
    - `lambda.timeout`: Pool Lambda timeout in seconds.
    - `lambda.reserved_concurrent_executions`: Reserved concurrency for the pool Lambda. Use `-1` for unreserved concurrency.
  EOT
  type = object({
    config = optional(list(object({
      schedule_expression          = string
      schedule_expression_timezone = optional(string)
      size                         = number
    })), [])
    include_busy_runners = optional(bool, false)
    runner_owner         = optional(string, null)
    tags                 = optional(map(string), {})
    lambda = optional(object({
      memory_size                    = optional(number, 512)
      timeout                        = optional(number, 60)
      reserved_concurrent_executions = optional(number, 1)
    }), {})
  })
  default = {}
}

variable "job_retry" {
  description = <<-EOT
    Job-retry queue and Lambda configuration.

    - `enabled`: Creates the retry queue, Lambda function, event-source mapping, and related IAM resources.
    - `delay_in_seconds`: Initial delay before a queued-job retry check. AWS SQS limits this value to 900 seconds.
    - `delay_backoff`: Multiplier applied to the delay after each unsuccessful check.
    - `max_attempts`: Maximum retry-check attempts before the message is no longer republished.
    - `tags`: Tags for job-retry resources, including the Lambda function, log group, IAM role, retry queue, and event-source mapping. These override module-level tags and the shared `lambda.tags`, `queue.tags`, and `observability.logs.tags` maps when keys conflict.
    - `lambda.memory_size`: Memory allocated to the job-retry Lambda in MB.
    - `lambda.reserved_concurrent_executions`: Reserved concurrency for the job-retry Lambda. Use `-1` for unreserved concurrency.
    - `lambda.timeout`: Job-retry Lambda timeout in seconds and visibility timeout for its retry queue.
  EOT
  type = object({
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
  })
  default = {}

  validation {
    condition     = !var.job_retry.enabled || var.job_retry.delay_in_seconds <= 900
    error_message = "job_retry.delay_in_seconds cannot exceed the SQS maximum of 900 seconds."
  }
}

variable "ssm" {
  description = <<-EOT
    Parameter Store paths, encryption, tag scopes, and housekeeper configuration.

    - `paths.root`: Root Parameter Store path for this runner stack.
    - `paths.tokens`: Path segment under `paths.root` used for registration tokens and just-in-time configuration.
    - `paths.config`: Path segment under `paths.root` used for persistent runner configuration.
    - `kms_key`: Optional customer-managed KMS key used to encrypt temporary registration parameters. The wrapper's presence is the plan-time policy discriminator.
    - `kms_key.arn`: ARN of the customer-managed KMS key. The ARN may be unknown until apply.
    - `tags`: Shared tags for SSM-related resources. These override module-level `tags` and are inherited by parameter and housekeeper resources.
    - `parameters.tags`: Tags for Terraform-managed runner configuration parameters and temporary parameters created by the scale-up and pool Lambdas. These override module-level and `ssm.tags` values with the same key.
    - `housekeeper.schedule_expression`: EventBridge schedule expression that invokes the SSM housekeeper.
    - `housekeeper.state`: EventBridge rule state, such as `ENABLED` or `DISABLED`.
    - `housekeeper.tags`: Tags for housekeeper resources, including the Lambda function, log group, EventBridge rule, and IAM role. These override module-level, `ssm.tags`, shared Lambda, and shared log tags when keys conflict.
    - `housekeeper.lambda.memory_size`: Memory allocated to the SSM housekeeper Lambda in MB.
    - `housekeeper.lambda.timeout`: SSM housekeeper Lambda timeout in seconds.
    - `housekeeper.config.tokenPath`: Parameter Store token path cleaned by the housekeeper. When omitted, the configured runner token path is used.
    - `housekeeper.config.minimumDaysOld`: Minimum parameter age in days before deletion is allowed.
    - `housekeeper.config.dryRun`: Reports eligible parameters without deleting them when true.
  EOT
  type = object({
    paths = object({
      root   = string
      tokens = string
      config = string
    })
    kms_key = optional(object({
      arn = string
    }), null)
    tags = optional(map(string), {})
    parameters = optional(object({
      tags = optional(map(string), {})
    }), {})
    housekeeper = optional(object({
      schedule_expression = optional(string, "rate(1 day)")
      state               = optional(string, "ENABLED")
      tags                = optional(map(string), {})
      lambda = optional(object({
        memory_size = optional(number, 512)
        timeout     = optional(number, 60)
      }), {})
      config = optional(object({
        tokenPath      = optional(string)
        minimumDaysOld = optional(number, 1)
        dryRun         = optional(bool, false)
      }), {})
    }), {})
  })
}

variable "observability" {
  description = <<-EOT
    Logging, tracing, and metrics configuration for control-plane and provider resources.

    - `logs.level`: Application log level supplied to the control-plane functions.
    - `logs.retention_in_days`: CloudWatch Logs retention period.
    - `logs.kms_key_id`: Optional KMS key ID or ARN used to encrypt CloudWatch log groups.
    - `logs.class`: CloudWatch log-group class. Supported values are `STANDARD` and `INFREQUENT_ACCESS`.
    - `logs.tags`: Shared tags for CloudWatch log groups. These override module-level `tags`; component `tags` override this map when keys conflict.
    - `tracing.mode`: Optional Lambda active-tracing mode. Null disables X-Ray tracing configuration.
    - `tracing.capture_http_requests`: Enables HTTP request capture in the tracing helper.
    - `tracing.capture_error`: Enables error capture in the tracing helper.
    - `metrics.enable`: Enables module-emitted metrics.
    - `metrics.namespace`: CloudWatch namespace used for emitted metrics.
    - `metrics.metric.enable_github_app_rate_limit`: Emits GitHub App rate-limit metrics.
    - `metrics.metric.enable_job_retry`: Emits job-retry metrics.
    - `metrics.metric.enable_spot_termination_warning`: Emits spot-termination warning metrics where supported.
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
      enable    = optional(bool, false)
      namespace = optional(string, "GitHub Runners")
      metric = optional(object({
        enable_github_app_rate_limit    = optional(bool, true)
        enable_job_retry                = optional(bool, true)
        enable_spot_termination_warning = optional(bool, true)
      }), {})
    }), {})
  })
  default = {}

  validation {
    condition     = contains(["STANDARD", "INFREQUENT_ACCESS"], var.observability.logs.class)
    error_message = "observability.logs.class must be STANDARD or INFREQUENT_ACCESS."
  }

  validation {
    condition = contains([
      "silly",
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
    ], var.observability.logs.level)
    error_message = "observability.logs.level must be one of silly, trace, debug, info, warn, error, or fatal."
  }
}
