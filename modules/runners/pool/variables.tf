variable "config" {
  type = object({
    lambda = object({
      log_level                      = string
      log_type                       = string
      logging_retention_in_days      = number
      logging_kms_key_id             = string
      reserved_concurrent_executions = number
      s3_bucket                      = string
      s3_key                         = string
      s3_object_version              = string
      security_group_ids             = list(string)
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
      extra_labels              = string
      launch_template = object({
        name = string
      })
      group_name = string
      pool_owner = string
      role = object({
        arn = string
      })
    })
    instance_types                = list(string)
    instance_target_capacity_type = string
    instance_allocation_strategy  = string
    instance_max_spot_price       = string
    environment                   = string
    pool = list(object({
      schedule_expression = string
      size                = number
    }))
    role_permissions_boundary = string
    kms_key_arn               = string
    role_path                 = string
  })
}

variable "aws_partition" {
  description = "(optional) partition for the arn if not 'aws'"
  type        = string
  default     = "aws"
}
