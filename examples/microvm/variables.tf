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
  description = "GitHub for API usages."

  type = object({
    id             = string
    key_base64     = string
    webhook_secret = string
  })
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
