variable "github_app" {
  description = "GitHub for API usages."

  type = object({
    id         = string
    key_base64 = string
  })
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
  description = "Path to the webhook Lambda archive."
  type        = string
  default     = "../lambdas-download/webhook.zip"
}

variable "runners_lambda_zip" {
  description = "Path to the runners Lambda archive."
  type        = string
  default     = "../lambdas-download/runners.zip"
}

variable "runner_binaries_syncer_lambda_zip" {
  description = "Path to the runner binaries syncer Lambda archive."
  type        = string
  default     = "../lambdas-download/runner-binaries-syncer.zip"
}

variable "iam_state_path" {
  description = "Path to the state produced by the permissions-boundary setup. Uses the example setup state when unset."
  type        = string
  default     = null
}
