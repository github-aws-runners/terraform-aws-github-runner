variable "github_app" {
  description = "GitHub App ID, base64-encoded private key, and installation ID SSM parameter."

  type = object({
    id         = string
    key_base64 = string
    installation_id_ssm = optional(object({
      arn  = string
      name = string
    }))
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
    name                      = string
    id                        = number
    runner_group_id           = optional(number)
    runner_owner              = string
    runner_registration_level = string
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

variable "runner_binaries_enabled" {
  description = "Whether runner binary synchronization is enabled."

  type    = bool
  default = true
}

variable "ami" {
  description = "Optional AMI configuration keyed by runner lane."

  type = map(object({
    filter = optional(map(list(string)), { state = ["available"] })
    owners = optional(list(string), ["amazon"])
    id_ssm_parameter = optional(object({
      arn = string
    }), null)
    kms_key = optional(object({
      arn = string
    }), null)
  }))
  default = {}
}
