variable "github_app" {
  description = "GitHub for API usages."

  type = object({
    id         = string
    key_base64 = string
  })
}

variable "environment" {
  description = "Environment name, used as prefix"

  type    = string
  default = null
}

variable "aws_region" {
  description = "AWS region to deploy to"

  type    = string
  default = "eu-west-1"
}

variable "ami" {
  description = "AMI configuration applied to runner configurations that define an AMI."

  type = object({
    filter               = optional(map(list(string)), { state = ["available"] })
    owners               = optional(list(string), ["amazon"])
    id_ssm_parameter_arn = optional(string, null)
    kms_key_arn          = optional(string, null)
  })
  default = null
}

variable "runner_config_names" {
  description = "Optional set of runner configuration names to include in the example."

  type    = set(string)
  default = null
}
