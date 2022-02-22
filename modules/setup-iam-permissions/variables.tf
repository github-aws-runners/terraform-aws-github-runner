variable "environment" {
  description = "A name that identifies the environment, used as prefix and for tagging."
  type        = string
}

variable "namespaces" {
  description = "The role will be only allowed to create roles, policies and instance profiles in the given namespace / path. All policies in the boundaries namespace cannot be modified by this role."
  type = object({
    boundary_namespace         = string
    role_namespace             = string
    policy_namespace           = string
    instance_profile_namespace = string
  })
}

variable "account_id" {
  description = "The module allows to switch to the created role from the provided account id."
  type        = string

}

variable "aws_partition" {
  description = "(optional) partition in the arn namespace if not aws"
  type        = string
  default     = "aws"
}
