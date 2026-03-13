variable "enterprise_slug" {
  description = "The slug of the GitHub Enterprise account. Example: 'my-enterprise'."
  type        = string
}

variable "enterprise_pat" {
  description = "Personal Access Token with 'manage_runners:enterprise' scope for enterprise runner management."
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Environment name, used as prefix."
  type        = string
  default     = null
}

variable "aws_region" {
  description = "AWS region."
  type        = string
  default     = "eu-west-1"
}

