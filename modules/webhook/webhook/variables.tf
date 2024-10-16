variable "config" {
  description = "Configuration object for all variables."
  type = object({
    lambda_subnet_ids         = optional(list(string), [])
    lambda_security_group_ids = optional(list(string), [])
    prefix                    = optional(string, "github-actions")
    tags                      = optional(map(string), {})
    runner_matcher_config = map(object({
      arn  = string
      id   = string
      fifo = bool
      matcherConfig = object({
        labelMatchers = list(list(string))
        exactMatch    = bool
        priority      = optional(number, 999)
      })
    }))
    sqs_workflow_job_queue = optional(object({
      id  = string
      arn = string
    }), null)
    lambda_zip                = optional(string, null)
    lambda_memory_size        = optional(number, 256)
    lambda_timeout            = optional(number, 10)
    role_permissions_boundary = optional(string, null)
    role_path                 = optional(string, null)
    logging_retention_in_days = optional(number, 180)
    logging_kms_key_id        = optional(string, null)
    lambda_s3_bucket          = optional(string, null)
    lambda_s3_key             = optional(string, null)
    lambda_s3_object_version  = optional(string, null)
    lambda_apigateway_access_log_settings = optional(object({
      destination_arn = string
      format          = string
    }), null)
    repository_white_list = optional(list(string), [])
    kms_key_arn           = optional(string, null)
    log_level             = optional(string, "info")
    lambda_runtime        = optional(string, "nodejs20.x")
    aws_partition         = optional(string, "aws")
    lambda_architecture   = optional(string, "arm64")
    github_app_parameters = object({
      webhook_secret = map(string)
    })
    tracing_config = optional(object({
      mode                  = optional(string, null)
      capture_http_requests = optional(bool, false)
      capture_error         = optional(bool, false)
    }), {})
    ssm_paths = object({
      root    = string
      webhook = string
    })
    lambda_tags                         = optional(map(string), {})
    matcher_config_parameter_store_tier = optional(string, "Standard")
    legacy_mode                         = optional(bool, true)
    api_gw_source_arn                   = string
  })

  validation {
    condition = anytrue([
      var.config.log_level == "debug",
      var.config.log_level == "info",
      var.config.log_level == "warn",
      var.config.log_level == "error",
    ])
    error_message = "`log_level` value not valid. Valid values are 'debug', 'info', 'warn', 'error'."
  }

  validation {
    condition     = contains(["arm64", "x86_64"], var.config.lambda_architecture)
    error_message = "`lambda_architecture` value is not valid, valid values are: `arm64` and `x86_64`."
  }

  validation {
    condition     = contains(["Standard", "Advanced"], var.config.matcher_config_parameter_store_tier)
    error_message = "`matcher_config_parameter_store_tier` value is not valid, valid values are: `Standard`, and `Advanced`."
  }

  validation {
    condition     = try(var.config.runner_matcher_config.matcherConfig.priority, 999) >= 0 && try(var.config.runner_matcher_config.matcherConfig.priority, 999) < 1000
    error_message = "The priority of the matcher must be between 0 and 999."
  }
}
