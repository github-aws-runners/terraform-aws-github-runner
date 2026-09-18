variable "aws_region" {
  description = "AWS Region where the runner control plane and MicroVM resources are deployed."
  type        = string
  default     = "eu-west-1"
}

variable "environment" {
  description = "Name prefix for the example resources."
  type        = string
  default     = null
}

variable "github_app" {
  description = "Pre-created SSM parameter references for the GitHub App credentials."
  type = object({
    key_base64 = optional(string)
    key_base64_ssm = optional(object({
      arn  = string
      name = string
    }))
    id = optional(string)
    id_ssm = optional(object({
      arn  = string
      name = string
    }))
    webhook_secret = optional(string)
    webhook_secret_ssm = optional(object({
      arn  = string
      name = string
    }))
  })

  validation {
    condition = (
      var.github_app.key_base64 == null &&
      var.github_app.id == null &&
      var.github_app.webhook_secret == null &&
      var.github_app.key_base64_ssm != null &&
      var.github_app.id_ssm != null &&
      var.github_app.webhook_secret_ssm != null
    )
    error_message = "github_app must use pre-created SSM parameters for the key, app ID, and webhook secret."
  }
}

variable "lambda_artifact_bucket" {
  description = "S3 bucket containing the runner-control Lambda artifacts."
  type        = string
}

variable "runners_lambda_s3_key" {
  description = "S3 key for the runners Lambda archive."
  type        = string
  default     = "runners.zip"
}

variable "webhook_lambda_s3_key" {
  description = "S3 key for the webhook Lambda archive."
  type        = string
  default     = "webhook.zip"
}

variable "microvm_image_arn" {
  description = "Lambda MicroVM image ARN produced by the MicroVM image build."
  type        = string
}

variable "microvm_image_version" {
  description = "Optional immutable version of the Lambda MicroVM image."
  type        = string
  default     = null
}

variable "egress_network_connector_arn" {
  description = "Regional Lambda Network Connector ARN used by MicroVMs and the image build."
  type        = string
}

variable "ingress_network_connector_arns" {
  description = "Optional regional Lambda Network Connector ARNs exposed to MicroVMs."
  type        = list(string)
  default     = []
}

variable "organization_runners" {
  description = "Register the MicroVM runners at organization scope when true."
  type        = bool
  default     = false
}

variable "runners_maximum_count" {
  description = "Maximum number of concurrent MicroVM runners."
  type        = number
  default     = 10
}
