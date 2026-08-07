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
  description = "Map of tags added to created resources."
  type        = map(string)
  default     = {}
}

variable "runner" {
  description = "Provider-neutral GitHub runner configuration."
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
    hooks = optional(object({
      job_started   = optional(string, "")
      job_completed = optional(string, "")
    }), {})
    iam = optional(object({
      role = optional(object({
        arn = string
      }), null)
      managed_policy_arns  = optional(map(string), {})
      path                 = optional(string, null)
      permissions_boundary = optional(string, null)
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
}

variable "github" {
  description = "GitHub API and registration configuration."
  type = object({
    app_parameters = object({
      key_base64 = map(string)
      id         = map(string)
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
  description = "Build queue and Lambda event-source configuration."
  type = object({
    build = object({
      arn = string
      url = string
    })
    event_source_mapping = optional(object({
      batch_size                         = optional(number, 10)
      maximum_batching_window_in_seconds = optional(number, 0)
    }), {})
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
  description = "Configuration shared by the control-plane Lambda functions."
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
  description = "Scale-up Lambda configuration."
  type = object({
    memory_size                    = optional(number, 512)
    timeout                        = optional(number, 60)
    reserved_concurrent_executions = optional(number, 1)
    job_queued_check_enabled       = optional(bool, null)
  })
  default = {}
}

variable "scale_down" {
  description = "Scale-down Lambda and idle-runner configuration."
  type = object({
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
  })
  default = {}
}

variable "pool" {
  description = "Scheduled runner-pool configuration."
  type = object({
    config = optional(list(object({
      schedule_expression          = string
      schedule_expression_timezone = optional(string)
      size                         = number
    })), [])
    include_busy_runners = optional(bool, false)
    runner_owner         = optional(string, null)
    lambda = optional(object({
      memory_size                    = optional(number, 512)
      timeout                        = optional(number, 60)
      reserved_concurrent_executions = optional(number, 1)
    }), {})
  })
  default = {}
}

variable "job_retry" {
  description = "Job-retry queue and Lambda configuration."
  type = object({
    enabled          = optional(bool, false)
    delay_in_seconds = optional(number, 300)
    delay_backoff    = optional(number, 2)
    max_attempts     = optional(number, 1)
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
  description = "Parameter Store paths, encryption, tags, and housekeeper configuration."
  type = object({
    paths = object({
      root   = string
      tokens = string
      config = string
    })
    kms_key_arn    = optional(string, null)
    parameter_tags = optional(map(string), {})
    housekeeper = optional(object({
      schedule_expression = optional(string, "rate(1 day)")
      state               = optional(string, "ENABLED")
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
  description = "Logging, tracing, and metrics configuration."
  type = object({
    log_level = optional(string, "info")
    logs = optional(object({
      retention_in_days = optional(number, 180)
      kms_key_id        = optional(string, null)
      class             = optional(string, "STANDARD")
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
    ], var.observability.log_level)
    error_message = "observability.log_level must be one of silly, trace, debug, info, warn, error, or fatal."
  }
}
