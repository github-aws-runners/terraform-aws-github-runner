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
  description = "Resolved provider-owned values from orchestration.webhook, including the runner capacity limit used by scaling and pool controls."
  type = object({
    runner = object({
      maximum_count = number
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
      scale = object({
        artifact = object({
          zip = optional(string, null)
          s3 = optional(object({
            key            = string
            object_version = optional(string, null)
          }), null)
        })
      })
      scale_up = object({
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
        tags = optional(map(string), {})
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
      var.config.lambda.scale.artifact.zip != null &&
      var.config.lambda.scale.artifact.s3 != null
    )
    error_message = "config.lambda.scale.artifact must select at most one of zip or s3."
  }
}

variable "runner" {
  description = "Common runner registration values consumed by webhook demand controls. Capacity remains provider-owned under config.runner."
  type = object({
    os                   = string
    auto_update_disabled = bool
    ephemeral            = bool
    jit_config_enabled   = optional(bool, null)
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
  description = "Selected compute-provider capabilities consumed by webhook scaling, pool, and retry controls."
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
