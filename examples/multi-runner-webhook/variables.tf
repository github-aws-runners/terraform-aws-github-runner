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
  description = "GitHub App credentials used by the webhook orchestration provider."
  sensitive   = true

  type = object({
    id             = string
    key_base64     = string
    webhook_secret = string
  })
}

variable "github_enterprise_server" {
  description = "Optional GitHub Enterprise Server endpoint used by the smoke-test API mock."
  type = object({
    url        = string
    ssl_verify = bool
  })
  default = null
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
  description = "Provider-specific settings for the EC2 and MicroVM runner lanes."

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
      microvm = object({
        image_arn                  = string
        image_version              = optional(string, null)
        ingress_network_connectors = optional(list(string), [])
        egress_network_connectors  = list(string)
      })
    })
  })
}
