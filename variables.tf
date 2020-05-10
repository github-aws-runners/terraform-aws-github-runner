variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "vpc_id" {
  description = "The VPC for security groups of the action runners."
  type        = string
}

variable "subnet_ids" {
  description = "List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`."
  type        = list(string)
}


variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name and environment."
  type        = map(string)
  default     = {}
}

variable "environment" {
  description = "A name that identifies the environment, used as prefix and for tagging."
  type        = string
}

variable "github_app_webhook_secret" {
  description = "Secret for the GitHub App webhook"
  type        = string
}

variable "enable_organization_runners" {
  type = bool
}

variable "github_app_key_base64" {}

variable "github_app_id" {}

variable "github_app_client_id" {}

variable "github_app_client_secret" {}
