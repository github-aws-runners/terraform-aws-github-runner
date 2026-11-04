variable "aws_region" {
  description = "AWS Region where the runner control plane and compute provider resources are deployed."
  type        = string
  default     = "eu-west-1"
}

variable "environment" {
  description = "Name prefix for the example resources."
  type        = string
}

variable "github_app" {
  description = "GitHub App ID, base64-encoded private key, and installation ID."

  type = object({
    id              = string
    key_base64      = string
    installation_id = optional(string, null)
    webhook_secret  = string
  })
  sensitive = true
}

variable "github" {
  description = "Optional GitHub endpoint and scale-set ownership settings."

  type = object({
    url                = optional(string, null)
    ssl_verify         = optional(bool, true)
    runner_owner       = optional(string, null)
    registration_level = optional(string, "organization")
  })

  default = {}
}

variable "runners_lambda_zip" {
  description = "Local ZIP file for the runner-control Lambda."
  type        = string
}

variable "webhook_lambda_zip" {
  description = "Local ZIP file for the webhook Lambda."
  type        = string
}

variable "compute_provider" {
  description = "Provider-specific settings for compute providers."

  type = object({
    aws = object({
      ec2 = object({
        instance_types = list(string)
        ami = object({
          filter = optional(map(list(string)), { state = ["available"] })
          owners = optional(list(string), ["amazon"])
          id_ssm_parameter = optional(object({
            arn = string
          }), null)
          kms_key = optional(object({
            arn = string
          }), null)
        })
      })
    })
  })
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
    ecs = optional(object({
      task = optional(object({
        architecture = optional(string, "x86_64")
      }), {})
    }), {})
  })
}