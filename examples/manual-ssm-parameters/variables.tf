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
