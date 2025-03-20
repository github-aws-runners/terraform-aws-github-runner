variable "prefix" {
  description = "The prefix used for naming resources"
  type        = string
}

variable "aws_partition" {
  description = "The AWS partition to use (e.g., aws, aws-cn)"
  type        = string
  default     = "aws"
}

variable "tags" {
  description = "Map of tags that will be added to created resources"
  type        = map(string)
  default     = {}
}

variable "lambda_runtime" {
  description = "AWS Lambda runtime"
  type        = string
  default     = "nodejs20.x"
}

variable "lambda_architecture" {
  description = "AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86_64' functions."
  type        = string
  default     = "x86_64"
  validation {
    condition     = contains(["arm64", "x86_64"], var.lambda_architecture)
    error_message = "Valid values for lambda_architecture are (arm64, x86_64)."
  }
}

variable "lambda_timeout" {
  description = "Time out of the lambda in seconds."
  type        = number
  default     = 30
}

variable "lambda_memory_size" {
  description = "Lambda memory size limit."
  type        = number
  default     = 512
}

variable "role_path" {
  description = "The path that will be added to the role, if not set the environment will be used."
  type        = string
  default     = null
}

variable "role_permissions_boundary" {
  description = "Permissions boundary that will be added to the created role."
  type        = string
  default     = null
}

variable "lambda_subnet_ids" {
  description = "List of subnets in which the lambda will be able to access."
  type        = list(string)
  default     = null
}

variable "lambda_security_group_ids" {
  description = "List of security group IDs associated with the Lambda function."
  type        = list(string)
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

variable "tracing_config" {
  description = "Configuration for lambda tracing."
  type = object({
    mode            = optional(string, null)
    capture_error   = optional(bool, false)
    capture_request = optional(bool, false)
  })
  default = {}
}

variable "log_level" {
  description = "Logging level for lambda function."
  type        = string
  default     = "info"
}

variable "schedule_expression" {
  description = "The scheduling expression for triggering the Lambda function. For example, cron(0 20 * * ? *) or rate(5 minutes)."
  type        = string
  default     = "rate(1 day)"
}

variable "state" {
  description = "The state of the EventBridge rule. Valid values: ENABLED, DISABLED"
  type        = string
  default     = "ENABLED"
  validation {
    condition     = contains(["ENABLED", "DISABLED"], var.state)
    error_message = "Valid values for state are (ENABLED, DISABLED)."
  }
}

variable "ssm_parameter_name" {
  description = "The name of the SSM parameter to store the latest AMI ID."
  type        = string
  default     = "/github-action-runners/latest_ami_id"
}

variable "config" {
  description = "Configuration for the AMI updater."
  type = object({
    dry_run = optional(bool, true)
    ami_filter = object({
      owners = list(string)
      filters = list(object({
        name   = string
        values = list(string)
      }))
    })
  })
}

variable "lambda_zip" {
  description = "Path to Lambda zip file, will be used when S3 bucket is not set"
  type        = string
  default     = null
}

variable "lambda_s3_bucket" {
  description = "S3 bucket from which to specify lambda functions source code"
  type        = string
  default     = null
}

variable "lambda_s3_key" {
  description = "S3 key from which to specify lambda function source code"
  type        = string
  default     = null
}

variable "lambda_s3_object_version" {
  description = "S3 object version from which to specify lambda function source code"
  type        = string
  default     = null
}

variable "lambda_tags" {
  description = "Additional tags to apply to the Lambda function"
  type        = map(string)
  default     = {}
}
