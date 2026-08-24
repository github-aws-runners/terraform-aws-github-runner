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

variable "lambda_zip_overrides" {
  description = "Optional local Lambda archive paths passed to the runner module."

  type = object({
    ami_housekeeper        = optional(string)
    runner_binaries_syncer = optional(string)
    runners                = optional(string)
    termination_watcher    = optional(string)
    webhook                = optional(string)
  })
  default = {}
}
