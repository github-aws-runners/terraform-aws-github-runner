variable "prefix" {
  description = "The prefix used for naming resources"
  type        = string
}

variable "tags" {
  description = "Map of tags that will be added to created resources"
  type        = map(string)
  default     = {}
}

variable "kms_key_arn" {
  description = "Optional CMK Key ARN to be used for DynamoDB encryption. If not provided, AWS managed key will be used."
  type        = string
  default     = null
}

variable "environment_filter" {
  description = "The environment tag value to filter EC2 instances. Should match the 'ghr:environment' tag value."
  type        = string
}

variable "counter_lambda_timeout" {
  description = "Time out for the counter update lambda in seconds."
  type        = number
  default     = 30
}

variable "counter_lambda_memory_size" {
  description = "Memory size limit in MB for counter update lambda."
  type        = number
  default     = 256
}

variable "lambda_runtime" {
  description = "AWS Lambda runtime for the counter function."
  type        = string
  default     = "nodejs20.x"
}

variable "lambda_architecture" {
  description = "AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance."
  type        = string
  default     = "arm64"
}

variable "lambda_s3_bucket" {
  description = "S3 bucket from which to get the lambda function. When not set, the lambda will be built locally."
  type        = string
  default     = null
}

variable "counter_lambda_s3_key" {
  description = "S3 key for the counter lambda function."
  type        = string
  default     = null
}

variable "counter_lambda_s3_object_version" {
  description = "S3 object version for the counter lambda function."
  type        = string
  default     = null
}

variable "logging_retention_in_days" {
  description = "Specifies the number of days you want to retain log events."
  type        = number
  default     = 7
}

variable "logging_kms_key_id" {
  description = "The KMS Key ARN to use for CloudWatch log group encryption."
  type        = string
  default     = null
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

variable "lambda_subnet_ids" {
  description = "List of subnets in which the lambda will be launched."
  type        = list(string)
  default     = null
}

variable "lambda_security_group_ids" {
  description = "List of security group IDs associated with the Lambda function."
  type        = list(string)
  default     = null
}

variable "role_permissions_boundary" {
  description = "Permissions boundary that will be added to the created role for the lambda."
  type        = string
  default     = null
}

variable "role_path" {
  description = "The path that will be added to the role."
  type        = string
  default     = null
}

variable "lambda_tags" {
  description = "Map of tags to add to the Lambda function."
  type        = map(string)
  default     = {}
}

variable "ttl_seconds" {
  description = "TTL for DynamoDB items in seconds. Items older than this will be automatically deleted."
  type        = number
  default     = 86400 # 24 hours
}

variable "cache_stale_threshold_ms" {
  description = "Maximum age in milliseconds before a cached count is considered stale and falls back to EC2 API."
  type        = number
  default     = 60000 # 60 seconds
}
