variable "github_app" {
  description = "GitHub for API usages."

  type = object({
    id         = string
    key_base64 = string
  })
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

variable "ami_housekeeper_lambda_zip" {
  description = "Path to the AMI housekeeper Lambda archive. Uses the module default when unset."
  type        = string
  default     = null
}

variable "termination_watcher_lambda_zip" {
  description = "Path to the termination watcher Lambda archive. Uses the module default when unset."
  type        = string
  default     = null
}
