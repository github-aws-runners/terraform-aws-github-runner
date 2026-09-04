variable "github_app" {
  description = "GitHub App ID and base64-encoded private key."

  type = object({
    id         = string
    key_base64 = string
  })
  sensitive = true
}

variable "scale_set" {
  description = "GitHub Actions scale-set configuration."

  type = object({
    config_url = string
    installation_id_ssm = object({
      arn  = string
      name = string
    })
    name            = string
    id              = number
    runner_group_id = optional(number)
  })
}

variable "environment" {
  description = "Environment name, used as prefix."

  type    = string
  default = null
}

variable "aws_region" {
  description = "AWS region to deploy to."

  type    = string
  default = "eu-west-1"
}
