variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "environment" {
  description = "A name that identifies the environment, used as prefix and for tagging."
  type        = string
}

variable "github_app_webhook_secret" {
  type = string
}

variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name and environment."
  type        = map(string)
  default     = {}
}

variable "sqs_build_queue" {
  type = object({
    id  = string
    arn = string
  })
}

variable "create_sqs_publish_policy" {
  type    = bool
  default = true
}
