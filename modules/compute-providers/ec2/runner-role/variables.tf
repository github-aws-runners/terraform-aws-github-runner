variable "aws_partition" {
  description = "AWS partition used to build IAM and SSM ARNs."
  type        = string
  default     = "aws"
}

variable "aws_region" {
  description = "AWS region containing the runner configuration parameters."
  type        = string
}

variable "enable_cloudwatch_agent" {
  description = "Include the CloudWatch agent policy in the runner role contract."
  type        = bool
}

variable "enable_runner_binaries_syncer" {
  description = "Include access to the runner distribution object in the runner role contract."
  type        = bool
}

variable "enable_ssm_on_runners" {
  description = "Include Session Manager permissions in the runner role contract."
  type        = bool
}

variable "s3_runner_binaries" {
  description = "S3 object containing the cached runner distribution; required when runner binary sync is enabled."
  type = object({
    arn = string
    key = string
  })
  default = null
}

variable "ssm_paths" {
  description = "SSM paths used for runner tokens and configuration."
  type = object({
    root   = string
    tokens = string
    config = string
  })
}
