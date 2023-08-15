variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name and environment."
  type        = map(string)
  default     = {}
}

variable "environment" {
  description = "A name that identifies the environment, used as prefix and for tagging."
  type        = string
  default     = null

  validation {
    condition     = var.environment == null
    error_message = "The \"environment\" variable is no longer used. To migrate, set the \"prefix\" variable to the original value of \"environment\" and optionally, add \"Environment\" to the \"tags\" variable map with the same value."
  }
}

variable "prefix" {
  description = "The prefix used for naming resources"
  type        = string
  default     = "github-actions"
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

variable "s3_logging_bucket" {
  description = "Bucket for action runner distribution bucket access logging."
  type        = string
  default     = null

  # Make sure the bucket name only contains legal characters
  validation {
    error_message = "Only lowercase alphanumeric characters and hyphens allowed in the bucket name."
    condition     = var.s3_logging_bucket == null || can(regex("^[a-z0-9-]*$", var.s3_logging_bucket))
  }
}

variable "s3_logging_bucket_prefix" {
  description = "Bucket prefix for action runner distribution bucket access logging."
  type        = string
  default     = null

  # Make sure the bucket prefix only contains legal characters
  validation {
    error_message = "Only alphanumeric characters, hyphens followed by single slashes allowed in the bucket prefix."
    condition     = var.s3_logging_bucket_prefix == null || can(regex("^(([a-zA-Z0-9-])+(\\/?))*$", var.s3_logging_bucket_prefix))
  }
}

variable "enable_event_rule_binaries_syncer" {
  type        = bool
  default     = true
  description = "Option to disable EventBridge Lambda trigger for the binary syncer, useful to stop automatic updates of binary distribution"
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

variable "runner_os" {
  description = "The EC2 Operating System type to use for action runner instances (linux,windows)."
  type        = string
  default     = "linux"

  validation {
    condition     = contains(["linux", "windows"], var.runner_os)
    error_message = "Valid values for runner_os are (linux, windows)."
  }
}

variable "runner_architecture" {
  description = "The platform architecture of the runner instance_type."
  type        = string
  default     = "x64"
  validation {
    condition = anytrue([
      var.runner_architecture == "x64",
      var.runner_architecture == "arm64",
    ])
    error_message = "`runner_architecture` value not valid, valid values are: `x64` and `arm64`."
  }
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

variable "runner_allow_prerelease_binaries" {
  description = "(Deprecated, no longer used), allow the runners to update to prerelease binaries."
  type        = bool
  default     = null

  validation {
    condition     = var.runner_allow_prerelease_binaries == null
    error_message = "The \"runner_allow_prerelease_binaries\" variable is no longer used. GitHub runners are not released as pre-release, only releases should be used."
  }
}

variable "lambda_s3_bucket" {
  description = "S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly."
  type        = string
  default     = null
}

variable "syncer_lambda_s3_key" {
  description = "S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas."
  type        = string
  default     = null
}

variable "syncer_lambda_s3_object_version" {
  description = "S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket."
  type        = string
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

variable "aws_partition" {
  description = "(optional) partition for the base arn if not 'aws'"
  type        = string
  default     = "aws"
}

variable "log_type" {
  description = "Logging format for lambda logging. Valid values are 'json', 'pretty', 'hidden'. "
  type        = string
  default     = null
  validation {
    condition     = var.log_type == null
    error_message = "DEPRECATED: `log_type` is not longer supported."
  }
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
    error_message = "PLEASE MIGRATE: The following log levels: 'silly', 'trace' and 'fatal' are not longeer supported."
  }

}

variable "server_side_encryption_configuration" {
  description = "Map containing server-side encryption configuration for runner-binaries S3 bucket."
  type        = any
  default = {
    rule = {
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
    }
  }
}

variable "s3_versioning" {
  description = "Status of S3 versioning for runner-binaries S3 bucket."
  type        = string
  default     = "Disabled"
}

variable "lambda_principals" {
  description = "(Optional) add extra principals to the role created for execution of the lambda, e.g. for local testing."
  type = list(object({
    type        = string
    identifiers = list(string)
  }))
  default = []
}

variable "lambda_runtime" {
  description = "AWS Lambda runtime."
  type        = string
  default     = "nodejs18.x"
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

variable "lambda_tracing_mode" {
  description = "Enable X-Ray tracing for the lambda functions."
  type        = string
  default     = null
}
