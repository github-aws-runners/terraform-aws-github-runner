variable "environment" {
  description = "A name that identifies the environment, used as prefix and for tagging."
  type        = string
}

variable "namespaces" {
  description = "The role will be only allowed to crated rolo, policies and instance profiles in the gevin namespace / path. All policies in the boundaries namespace cannot be modified by this role."
  type = object({
    boundary_namespace         = string
    role_namespace             = string
    policy_namespace           = string
    instance_profile_namespace = string
  })
}

variable "account_id" {
  description = "The module allows to switch to te crateed role from the provided account id."
  type        = string

}
