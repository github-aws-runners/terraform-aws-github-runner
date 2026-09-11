variable "environment" {
  description = "Environment name used as the resource prefix."
  type        = string
  default     = "migration-test"
}

variable "aws_region" {
  description = "AWS region."
  type        = string
  default     = "eu-west-1"
}

variable "github_app" {
  description = "Test-only GitHub App values used by the MiniStack fixture."
  type = object({
    id         = string
    key_base64 = string
  })
  sensitive = true
}
