variable "config" {
  description = "Configuration object for all variables."
  type = object({
    prefix = string
    archive = optional(object({
      enable         = optional(bool, true)
      retention_days = optional(number, 7)
    }), {})
    tags = optional(map(string), {})

    lambda_subnet_ids         = optional(list(string), [])
    lambda_security_group_ids = optional(list(string), [])
    sqs_job_queues_arns       = list(string)
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
    lambda_runtime        = optional(string, "nodejs22.x")
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
    lambda_tags       = optional(map(string), {})
    api_gw_source_arn = string
    ssm_parameter_runner_matcher_config = object({
      name    = string
      arn     = string
      version = string
    })
  })
}
