variable "environments" {
  description = "List of environment configurations for scale-down"
  type = list(object({
    environment                     = string
    idle_config                     = list(object({
      cron             = string
      timeZone         = string
      idleCount        = number
      evictionStrategy = optional(string, "oldest_first")
    }))
    minimum_running_time_in_minutes = number
    runner_boot_time_in_minutes     = number
  }))
}

variable "prefix" {
  description = "Prefix for Lambda function name"
  type        = string
}

variable "schedule_expression" {
  description = "CloudWatch Event schedule expression"
  type        = string
  default     = "cron(*/5 * * * ? *)"
}

variable "github_app_parameters" {
  description = "GitHub App SSM parameters"
  type = object({
    id = object({
      name = string
      arn  = string
    })
    key_base64 = object({
      name = string
      arn  = string
    })
  })
}

variable "lambda_s3_bucket" {
  description = "S3 bucket for Lambda deployment package"
  type        = string
  default     = null
}

variable "runners_lambda_s3_key" {
  description = "S3 key for Lambda deployment package"
  type        = string
  default     = null
}

variable "runners_lambda_s3_object_version" {
  description = "S3 object version for Lambda deployment package"
  type        = string
  default     = null
}

variable "lambda_runtime" {
  description = "Lambda runtime"
  type        = string
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds"
  type        = number
}

variable "lambda_memory_size" {
  description = "Lambda memory size in MB"
  type        = number
}

variable "lambda_architecture" {
  description = "Lambda architecture (x86_64 or arm64)"
  type        = string
}

variable "lambda_zip" {
  description = "Path to Lambda deployment package"
  type        = string
}

variable "lambda_subnet_ids" {
  description = "List of subnet IDs for Lambda VPC configuration"
  type        = list(string)
  default     = []
}

variable "lambda_security_group_ids" {
  description = "List of security group IDs for Lambda VPC configuration"
  type        = list(string)
  default     = []
}

variable "lambda_tags" {
  description = "Tags for Lambda function"
  type        = map(string)
  default     = {}
}

variable "tracing_config" {
  description = "Lambda tracing configuration"
  type = object({
    mode                      = optional(string, null)
    capture_http_requests     = optional(bool, false)
    capture_error             = optional(bool, false)
  })
  default = {}
}

variable "logging_retention_in_days" {
  description = "CloudWatch log retention in days"
  type        = number
}

variable "logging_kms_key_id" {
  description = "KMS key ID for CloudWatch log encryption"
  type        = string
  default     = null
}

variable "kms_key_arn" {
  description = "KMS key ARN for SSM parameter decryption"
  type        = string
  default     = ""
}

variable "ghes_url" {
  description = "GitHub Enterprise Server URL"
  type        = string
  default     = null
}

variable "ghes_ssl_verify" {
  description = "Verify GitHub Enterprise Server SSL certificate"
  type        = bool
  default     = true
}

variable "user_agent" {
  description = "User agent string for GitHub API requests"
  type        = string
  default     = null
}

variable "log_level" {
  description = "Log level for Lambda function"
  type        = string
  default     = "info"
}

variable "metrics" {
  description = "Metrics configuration"
  type = object({
    enable    = optional(bool, false)
    namespace = optional(string, "GitHub Runners")
    metric    = optional(object({
      enable_github_app_rate_limit = optional(bool, true)
    }), {})
  })
  default = {}
}

variable "role_path" {
  description = "IAM role path"
  type        = string
}

variable "role_permissions_boundary" {
  description = "IAM role permissions boundary ARN"
  type        = string
  default     = null
}

variable "aws_partition" {
  description = "AWS partition"
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
