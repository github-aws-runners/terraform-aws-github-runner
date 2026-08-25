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

variable "runner_os" {
  description = "The EC2 Operating System type to use for action runner instances (linux, osx, windows)."

  type    = string
  default = "linux"
}

variable "ami_name_filter" {
  description = "AMI name filter for the action runner AMI. By default amazon linux 2 is used."

  type    = string
  default = "github-runner-al2023-x86_64-*"
}

variable "configure_github_app" {
  description = "Whether to update the GitHub App webhook after deploying the runners."
  type        = bool
  default     = true
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

variable "ami_housekeeper_lambda_zip" {
  description = "Path to the AMI housekeeper Lambda archive. Uses the module default when unset."
  type        = string
  default     = null
}
