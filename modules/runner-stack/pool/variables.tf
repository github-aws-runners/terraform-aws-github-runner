variable "config" {
  description = "Lookup details in parent module."
  type = object({
    lambda = object({
      log_level                      = string
      logging_retention_in_days      = number
      logging_kms_key_id             = string
      log_class                      = string
      reserved_concurrent_executions = number
      s3_bucket                      = string
      s3_key                         = string
      s3_object_version              = string
      security_group_ids             = list(string)
      runtime                        = string
      architecture                   = string
      memory_size                    = number
      timeout                        = number
      zip                            = string
      subnet_ids                     = list(string)
      parameter_store_tags           = string
    })
    tags = map(string)
    ghes = object({
      url        = string
      ssl_verify = string
    })
    github_app_parameters = object({
      key_base64 = map(string)
      id         = map(string)
    })
    runner = object({
      disable_runner_autoupdate = bool
      ephemeral                 = bool
      enable_jit_config         = bool
      labels                    = list(string)
      group_name                = string
      name_prefix               = string
      pool_owner                = string
    })
    runners_maximum_count = number
    prefix                = string
    pool = list(object({
      schedule_expression          = string
      schedule_expression_timezone = string
      size                         = number
    }))
    include_busy_runners           = bool
    role_permissions_boundary      = string
    kms_key_arn                    = string
    role_path                      = string
    ssm_token_path                 = string
    ssm_config_path                = string
    arn_ssm_parameters_path_config = string
    lambda_tags                    = map(string)
    user_agent                     = string
  })
}

variable "runner_provider" {
  description = "Compute provider configuration for the pool Lambda."
  type = object({
    type                   = string
    environment_variables  = map(string)
    iam_policy_json        = string
    managed_policy_enabled = bool
    managed_policy_arn     = optional(string, null)
  })

  validation {
    condition     = trimspace(var.runner_provider.type) != ""
    error_message = "The compute provider type must not be empty."
  }

  validation {
    condition     = can(jsondecode(var.runner_provider.iam_policy_json))
    error_message = "The compute provider IAM policy must be valid JSON."
  }

  validation {
    condition     = !var.runner_provider.managed_policy_enabled || var.runner_provider.managed_policy_arn != null
    error_message = "The compute provider managed policy ARN must be set when its attachment is enabled."
  }
}

variable "aws_partition" {
  description = "(optional) partition for the arn if not 'aws'"
  type        = string
  default     = "aws"
}

variable "tracing_config" {
  description = "Configuration for lambda tracing."
  type = object({
    mode                  = optional(string, null)
    capture_http_requests = optional(bool, false)
    capture_error         = optional(bool, false)
  })
  default = {}
}
