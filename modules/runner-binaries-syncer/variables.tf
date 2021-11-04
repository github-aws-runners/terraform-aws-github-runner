variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name and environment."
  type        = map(string)
  default     = {}
}

variable "environment" {
  description = "A name that identifies the environment, used as prefix and for tagging."
  type        = string
}

variable "distribution_bucket_name" {
  description = "Bucket for storing the action runner distribution."
  type        = string

  # Make sure the bucket name only contains legal characters
  validation {
    error_message = "Only lowercase alphanumeric characters and hyphens allowed in the bucket name."
    condition     = can(regex("^[a-z0-9-]*$", var.distribution_bucket_name))
  }
}
variable "lambda_schedule_expression" {
  description = "Scheduler expression for action runner binary syncer."
  type        = string
  default     = "cron(27 * * * ? *)"
}

variable "lambda_zip" {
  description = "File location of the lambda zip file."
  type        = string
  default     = null
}

variable "lambda_timeout" {
  description = "Time out of the lambda in seconds."
  type        = number
  default     = 300
}

variable "role_permissions_boundary" {
  description = "Permissions boundary that will be added to the created role for the lambda."
  type        = string
  default     = null
}

variable "role_path" {
  description = "The path that will be added to the role, if not set the environment name will be used."
  type        = string
  default     = null
}

variable "runner_architecture" {
  description = "The platform architecture for the runner instance (x64, arm64), defaults to 'x64'"
  type        = string
  default     = "x64"
}

variable "logging_retention_in_days" {
  description = "Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653."
  type        = number
  default     = 7
}

variable "runner_allow_prerelease_binaries" {
  description = "Allow the runners to update to prerelease binaries."
  type        = bool
  default     = false
}

variable "lambda_s3_bucket" {
  description = "S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly."
  default     = null
}

variable "syncer_lambda_s3_key" {
  description = "S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas."
  default     = null
}

variable "syncer_lambda_s3_object_version" {
  description = "S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket."
  default     = null
}

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

variable "log_type" {
  description = "Logging format for lambda logging. Valid values are 'json', 'pretty', 'hidden'. "
  type        = string
  default     = "pretty"
  validation {
    condition = anytrue([
      var.log_type == "json",
      var.log_type == "pretty",
      var.log_type == "hidden",
    ])
    error_message = "`log_type` value not valid. Valid values are 'json', 'pretty', 'hidden'."
  }
}

variable "log_level" {
  description = "Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'."
  type        = string
  default     = "info"
  validation {
    condition = anytrue([
      var.log_level == "silly",
      var.log_level == "trace",
      var.log_level == "debug",
      var.log_level == "info",
      var.log_level == "warn",
      var.log_level == "error",
      var.log_level == "fatal",
    ])
    error_message = "`log_level` value not valid. Valid values are 'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'."
  }
}

variable "server_side_encryption_configuration" {
  description = "Map containing server-side encryption configuration."
  type        = any
  default     = {}
}
