variable "config" {
  type = object({
    lambda = object({
      log_level                      = string
      logging_retention_in_days      = number
      logging_kms_key_id             = string
      reserved_concurrent_executions = number
      s3_bucket                      = string
      s3_key                         = string
      s3_object_version              = string
      security_group_ids             = list(string)
      runtime                        = string
      architecture                   = string
      timeout                        = number
      zip                            = string
      subnet_ids                     = list(string)
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
    subnet_ids = list(string)
    runner = object({
      disable_runner_autoupdate = bool
      ephemeral                 = bool
      enable_jit_config         = bool
      boot_time_in_minutes      = number
      labels                    = string
      launch_template = object({
        name = string
      })
      group_name  = string
      name_prefix = string
      pool_owner  = string
      role = object({
        arn = string
      })
    })
    instance_types                = list(string)
    instance_target_capacity_type = string
    instance_allocation_strategy  = string
    instance_max_spot_price       = string
    prefix                        = string
    pool = list(object({
      schedule_expression = string
      size                = number
    }))
    role_permissions_boundary            = string
    kms_key_arn                          = string
    ami_kms_key_arn                      = string
    role_path                            = string
    ssm_token_path                       = string
    ssm_config_path                      = string
    ami_id_ssm_parameter_name            = string
    ami_id_ssm_parameter_read_policy_arn = string
    arn_ssm_parameters_path_config       = string
  })
}

variable "aws_partition" {
  description = "(optional) partition for the arn if not 'aws'"
  type        = string
  default     = "aws"
}

variable "lambda_tracing_mode" {
  description = "Enable X-Ray tracing for the lambda functions."
  type        = string
  default     = null
}
