variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "environment" {
  description = "A name that identifies the environment, used as prefix and for tagging."
  type        = string
}

variable "github_app_webhook_secret" {
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
  description = "The path that will be added to the role, if not set the environment name will be used."
  type        = string
  default     = null
}

variable "encryption" {
  description = "KMS key to encrypted lambda environment secrets. Either provide a key and `ecnrypt` set to `true`. Or set the key to `null` and encrypt to `false`."
  type = object({
    kms_key_id = string
    encrypt    = bool
  })
}
