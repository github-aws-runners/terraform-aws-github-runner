variable "github_app" {
  description = "GitHub App ID, base64-encoded private key, and installation ID."

  type = object({
    id              = string
    key_base64      = string
    installation_id = optional(string, null)
  })
  sensitive = true
}

variable "github" {
  description = "Optional GitHub endpoint and scale-set ownership settings."

  type = object({
    config_url         = optional(string, null)
    ssl_verify         = optional(bool, true)
    runner_owner       = optional(string, null)
    registration_level = optional(string, "enterprise")
  })

  default = {}
}

variable "scale_set" {
  description = "GitHub Actions scale-set configuration."

  type = object({
    name              = string
    runner_group_name = optional(string, "Default")
    min_runners       = optional(number, 0)
    container = optional(object({
      image = optional(string, null)
    }), {})
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
