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
  description = "AMI configuration for the action runner instances."

  type = object({
    filter               = optional(map(list(string)), { state = ["available"] })
    owners               = optional(list(string), ["amazon"])
    id_ssm_parameter_arn = optional(string, null)
    kms_key_arn          = optional(string, null)
  })
  default = null
}
