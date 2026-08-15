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
    enterprise_server = optional(object({
      url        = optional(string, null)
      ssl_verify = optional(bool, true)
    }), {})
    user_agent = optional(string, null)
  })
}

variable "lambda" {
  description = <<-EOT
    Common Lambda substrate that is independent of the selected demand orchestration provider.

    It configures the per-stack SSM housekeeper and provides the artifact, runtime, networking, and role defaults
    used by classic webhook control-plane Lambdas. Component-specific sizing and tags belong to `orchestration.webhook`.
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
    principals = optional(list(object({
      type        = string
      identifiers = list(string)
    })), [])
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

variable "orchestration" {
  description = <<-EOT
    Mutually exclusive demand-orchestration provider configuration. Exactly one of `webhook` or `scale_set` must be non-null.

    `webhook` owns the classic build queue plus scale-up, scale-down, scheduled pool, and job-retry controls.
    `scale_set` owns the continuously running ECS listener. A scale-set lane creates no classic scaling Lambda, SQS, pool,
    or job-retry resources. Wrapper presence selects the provider and must therefore be known during planning.
  EOT
  type = object({
    webhook = optional(object({
      github = object({
        organization_runners = bool
      })
      queue = object({
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
      scale_up = optional(object({
        memory_size                    = optional(number, 512)
        timeout                        = optional(number, 60)
        reserved_concurrent_executions = optional(number, 1)
        job_queued_check_enabled       = optional(bool, null)
        tags                           = optional(map(string), {})
      }), {})
      scale_down = optional(object({
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
      pool = optional(object({
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
      id                = number
      github_config_url = string
      github_app_index  = optional(number, 0)
      min_runners       = optional(number, 0)
      session_owner     = optional(string, null)
      work_folder       = optional(string, "_work")
      container_image   = string
      tags              = optional(map(string), {})
      ecs = object({
        cluster = optional(object({
          arn = string
        }), null)
        vpc_id                    = string
        subnet_ids                = list(string)
        security_group_ids        = optional(list(string), [])
        create_security_group     = optional(bool, true)
        egress_ipv4_cidr_blocks   = optional(list(string), ["0.0.0.0/0"])
        egress_ipv6_cidr_blocks   = optional(list(string), [])
        assign_public_ip          = optional(bool, false)
        cpu                       = optional(number, 256)
        memory                    = optional(number, 512)
        architecture              = optional(string, "x86_64")
        platform_version          = optional(string, "LATEST")
        health_check_interval     = optional(number, 30)
        health_check_timeout      = optional(number, 5)
        health_check_retries      = optional(number, 3)
        health_check_start_period = optional(number, 30)
      })
      iam = optional(object({
        role_path            = optional(string, null)
        permissions_boundary = optional(string, null)
      }), {})
      alarm = optional(object({
        enabled    = optional(bool, false)
        actions    = optional(list(string), [])
        ok_actions = optional(list(string), [])
      }), {})
    }), null)
  })
  nullable = false

  validation {
    condition     = (var.orchestration.webhook == null) != (var.orchestration.scale_set == null)
    error_message = "Exactly one of orchestration.webhook or orchestration.scale_set must be configured."
  }

  validation {
    condition = var.orchestration.webhook == null ? true : (
      var.orchestration.webhook.queue.event_source_mapping.batch_size >= 1 &&
      var.orchestration.webhook.queue.event_source_mapping.batch_size <= 1000 &&
      var.orchestration.webhook.queue.event_source_mapping.maximum_batching_window_in_seconds >= 0 &&
      var.orchestration.webhook.queue.event_source_mapping.maximum_batching_window_in_seconds <= 300
    )
    error_message = "orchestration.webhook.queue event-source mapping batch size must be between 1 and 1000 and its batching window between 0 and 300 seconds."
  }

  validation {
    condition     = var.orchestration.webhook == null ? true : (!var.orchestration.webhook.job_retry.enabled || var.orchestration.webhook.job_retry.delay_in_seconds <= 900)
    error_message = "orchestration.webhook.job_retry.delay_in_seconds cannot exceed the SQS maximum of 900 seconds."
  }

  validation {
    condition = var.orchestration.scale_set == null ? true : (
      var.orchestration.scale_set.id > 0 &&
      floor(var.orchestration.scale_set.id) == var.orchestration.scale_set.id &&
      var.orchestration.scale_set.github_app_index >= 0 &&
      floor(var.orchestration.scale_set.github_app_index) == var.orchestration.scale_set.github_app_index &&
      var.orchestration.scale_set.min_runners >= 0 &&
      floor(var.orchestration.scale_set.min_runners) == var.orchestration.scale_set.min_runners
    )
    error_message = "orchestration.scale_set.id must be a positive integer, and github_app_index/min_runners must be non-negative integers."
  }

  validation {
    condition = var.orchestration.scale_set == null ? true : (
      can(regex("^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?/[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)?/?$", trimspace(var.orchestration.scale_set.github_config_url))) &&
      !can(regex("^https://[^/]+:443/", lower(trimspace(var.orchestration.scale_set.github_config_url)))) &&
      !can(regex("^https://[^/]+/enterprises/", lower(trimspace(var.orchestration.scale_set.github_config_url)))) &&
      can(regex("^[^@ ]+@sha256:[0-9a-fA-F]{64}$", var.orchestration.scale_set.container_image)) &&
      length(var.orchestration.scale_set.ecs.subnet_ids) > 0 &&
      trimspace(var.orchestration.scale_set.ecs.vpc_id) != "" &&
      contains(["arm64", "x86_64"], var.orchestration.scale_set.ecs.architecture) &&
      (var.orchestration.scale_set.ecs.create_security_group || length(var.orchestration.scale_set.ecs.security_group_ids) > 0)
    )
    error_message = "orchestration.scale_set requires a canonical HTTPS organization/repository URL with an optional non-default port from 1 to 65535, immutable image digest, VPC/subnets, supported architecture, and at least one ECS security group."
  }
}

variable "ssm" {
  description = <<-EOT
    Parameter Store paths, encryption, tag scopes, and housekeeper configuration.

    - `paths.root`: Root Parameter Store path for this runner stack.
    - `paths.tokens`: Path segment under `paths.root` used for registration tokens and just-in-time configuration.
    - `paths.config`: Path segment under `paths.root` used for persistent runner configuration.
    - `kms_key_id`: Optional customer-managed KMS key ARN used by control-plane IAM policies to decrypt shared GitHub App parameters. The ARN may be unknown until apply; IAM policy shape remains static. It does not select encryption for runtime-created runner parameters.
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
    kms_key_id = optional(string, null)
    tags       = optional(map(string), {})
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
