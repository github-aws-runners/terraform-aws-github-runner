variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "environment" {
  description = "A name that identifies the environment, used as prefix and for tagging."
  type        = string
}

variable "github_app_webhook_secret_arn" {
  type = string
}

variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name and environment."
  type        = map(string)
  default     = {}
}

variable "sqs_build_queue" {
  description = "SQS queue to publish accepted build events."
  type = object({
    id  = string
    arn = string
  })
}

variable "lambda_zip" {
  description = "File location of the lambda zip file."
  type        = string
  default     = null
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
  default     = 7
}

variable "logging_kms_key_id" {
  description = "Specifies the kms key id to encrypt the logs with"
  type        = string
  default     = null
}

variable "lambda_s3_bucket" {
  description = "S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly."
  default     = null
}

variable "webhook_lambda_s3_key" {
  description = "S3 key for webhook lambda function. Required if using S3 bucket to specify lambdas."
  default     = null
}

variable "webhook_lambda_s3_object_version" {
  description = "S3 object version for webhook lambda function. Useful if S3 versioning is enabled on source bucket."
  default     = null
}

variable "repository_white_list" {
  description = "List of repositories allowed to use the github app"
  type        = list(string)
  default     = []
}

variable "kms_key_arn" {
  description = "Optional CMK Key ARN to be used for Parameter Store."
  type        = string
  default     = null
}

variable "runner_labels" {
  description = "Extra (custom) labels for the runners (GitHub). Separate each label by a comma. Labels checks on the webhook can be enforced by setting `enable_workflow_job_labels_check`. GitHub read-only labels should not be provided."
  type        = string
  default     = ""
}

variable "enable_workflow_job_labels_check" {
  description = "If set to true all labels in the workflow job even are matched agaist the custom labels and GitHub labels (os, architecture and `self-hosted`). When the labels are not matching the event is dropped at the webhook."
  type        = bool
  default     = false
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

variable "disable_check_wokflow_job_labels" {
  description = "Disable the the check of workflow labels."
  type        = bool
  default     = false
}

variable "sqs_build_queue_fifo" {
  description = "Enable a FIFO queue to remain the order of events received by the webhook. Suggest to set to true for repo level runners."
  type        = bool
  default     = false
}
