variable "lambda_subnet_ids" {
  description = "List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`."
  type        = list(string)
  default     = []
}

variable "lambda_security_group_ids" {
  description = "List of security group IDs associated with the Lambda function."
  type        = list(string)
  default     = []
}

variable "prefix" {
  description = "The prefix used for naming resources"
  type        = string
  default     = "github-actions"
}

variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name and environment."
  type        = map(string)
  default     = {}
}

variable "runner_matcher_config" {
  description = "SQS queue to publish accepted build events based on the runner type. When exact match is disabled the webhook accepts the event if one of the workflow job labels is part of the matcher. The priority defines the order the matchers are applied."
  type = map(object({
    arn  = string
    id   = string
    fifo = bool
    matcherConfig = object({
      labelMatchers = list(list(string))
      exactMatch    = bool
      priority      = optional(number, 999)
    })
  }))
  validation {
    condition     = try(var.runner_matcher_config.matcherConfig.priority, 999) >= 0 && try(var.runner_matcher_config.matcherConfig.priority, 999) < 1000
    error_message = "The priority of the matcher must be between 0 and 999."
  }
}

variable "sqs_workflow_job_queue" {
  description = "SQS queue to monitor github events."
  type = object({
    id  = string
    arn = string
  })
  default = null
}
variable "lambda_zip" {
  description = "File location of the lambda zip file."
  type        = string
  default     = null
}

variable "lambda_memory_size" {
  description = "Memory size limit in MB for lambda."
  type        = number
  default     = 256
}

variable "lambda_timeout" {
  description = "Time out of the lambda in seconds."
  type        = number
  default     = 10
}

variable "role_permissions_boundary" {
  description = "Permissions boundary that will be added to the created role for the lambda."
  type        = string
  default     = null
}

variable "role_path" {
  description = "The path that will be added to the role; if not set, the environment name will be used."
  type        = string
  default     = null
}

variable "logging_retention_in_days" {
  description = "Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653."
  type        = number
  default     = 180
}

variable "logging_kms_key_id" {
  description = "Specifies the kms key id to encrypt the logs with"
  type        = string
  default     = null
}

variable "lambda_s3_bucket" {
  description = "S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly."
  type        = string
  default     = null
}

variable "webhook_lambda_s3_key" {
  description = "S3 key for webhook lambda function. Required if using S3 bucket to specify lambdas."
  type        = string
  default     = null
}

variable "webhook_lambda_s3_object_version" {
  description = "S3 object version for webhook lambda function. Useful if S3 versioning is enabled on source bucket."
  type        = string
  default     = null
}

variable "webhook_lambda_apigateway_access_log_settings" {
  description = "Access log settings for webhook API gateway."
  type = object({
    destination_arn = string
    format          = string
  })
  default = null
}

variable "repository_white_list" {
  description = "List of github repository full names (owner/repo_name) that will be allowed to use the github app. Leave empty for no filtering."
  type        = list(string)
  default     = []
}

variable "kms_key_arn" {
  description = "Optional CMK Key ARN to be used for Parameter Store."
  type        = string
  default     = null
}

variable "log_level" {
  description = "Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'."
  type        = string
  default     = "info"
  validation {
    condition = anytrue([
      var.log_level == "debug",
      var.log_level == "info",
      var.log_level == "warn",
      var.log_level == "error",
    ])
    error_message = "`log_level` value not valid. Valid values are 'debug', 'info', 'warn', 'error'."
  }
  validation {
    condition     = !contains(["silly", "trace", "fatal"], var.log_level)
    error_message = "PLEASE MIGRATE: The following log levels: 'silly', 'trace' and 'fatal' are not longer supported."
  }
}

variable "lambda_runtime" {
  description = "AWS Lambda runtime."
  type        = string
  default     = "nodejs20.x"
}

variable "aws_partition" {
  description = "(optional) partition for the base arn if not 'aws'"
  type        = string
  default     = "aws"
}

variable "lambda_architecture" {
  description = "AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86_64' functions. "
  type        = string
  default     = "arm64"
  validation {
    condition     = contains(["arm64", "x86_64"], var.lambda_architecture)
    error_message = "`lambda_architecture` value is not valid, valid values are: `arm64` and `x86_64`."
  }
}

variable "github_app_parameters" {
  description = "Parameter Store for GitHub App Parameters."
  type = object({
    webhook_secret = map(string)
  })
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

variable "ssm_paths" {
  description = "The root path used in SSM to store configuration and secrets."
  type = object({
    root    = string
    webhook = string
  })
}

variable "lambda_tags" {
  description = "Map of tags that will be added to all the lambda function resources. Note these are additional tags to the default tags."
  type        = map(string)
  default     = {}
}

variable "matcher_config_parameter_store_tier" {
  description = "The tier of the parameter store for the matcher configuration. Valid values are `Standard`, and `Advanced`."
  type        = string
  default     = "Standard"
  validation {
    condition     = contains(["Standard", "Advanced"], var.matcher_config_parameter_store_tier)
    error_message = "`matcher_config_parameter_store_tier` value is not valid, valid values are: `Standard`, and `Advanced`."
  }
}
