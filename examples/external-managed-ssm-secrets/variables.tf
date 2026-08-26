variable "github_app_ssm_parameters" {
  description = "SSM parameters details for the GitHub App, that you've created manually on AWS."
  type = object({
    key_base64 = optional(object({
      arn  = string
      name = string
    }))
    id = optional(object({
      arn  = string
      name = string
    }))
    webhook_secret = optional(object({
      arn  = string
      name = string
    }))
  })
  default = {}
}

variable "environment" {
  description = "Environment name, used as prefix."

  type    = string
  default = null
}

variable "aws_region" {
  description = "AWS region."

  type    = string
  default = "eu-west-1"
}

variable "ami" {
  description = "AMI configuration for the action runner instances. Uses the module default when unset."
  type = object({
    filter               = optional(map(list(string)), { state = ["available"] })
    owners               = optional(list(string), ["amazon"])
    id_ssm_parameter_arn = optional(string, null)
    kms_key_arn          = optional(string, null)
  })
  default = null
}

variable "aws_s3_use_path_style" {
  description = "Whether the AWS provider should use path-style S3 addressing."
  type        = bool
  default     = false
}

variable "webhook_lambda_zip" {
  description = "Path to the webhook Lambda archive. Uses the module default when unset."
  type        = string
  default     = null
}

variable "runners_lambda_zip" {
  description = "Path to the runners Lambda archive. Uses the module default when unset."
  type        = string
  default     = null
}

variable "runner_binaries_syncer_lambda_zip" {
  description = "Path to the runner binaries syncer Lambda archive. Uses the module default when unset."
  type        = string
  default     = null
}
