# Experimental global defaults shared by all runner lanes.
variable "experimental_global_config" {
  description = "Experimental global defaults shared by all runner lanes."
  type = object({
    tags = optional(map(string), {})

    roles = optional(object({
      path                 = optional(string, null)
      permissions_boundary = optional(string, null)
    }), {})

    runner = optional(object({
      os                     = optional(string, null)
      architecture           = optional(string, null)
      disable_default_labels = optional(bool, false)
      extra_labels           = optional(list(string), [])
      group_name             = optional(string, "Default")
      name_prefix            = optional(string, "")
      run_as_root            = optional(bool, false)
      run_as                 = optional(string, "ec2-user")
      auto_update_disabled   = optional(bool, false)
      tags                   = optional(map(string), {})
      hooks = optional(object({
        job_started   = optional(string, "")
        job_completed = optional(string, "")
      }), {})
      iam = optional(object({
        role = optional(object({
          arn = string
        }), null)
        managed_policy_arns          = optional(map(string), {})
        additional_trust_policy_json = optional(string, null)
        path                         = optional(string, null)
        permissions_boundary         = optional(string, null)
      }), {})
    }), {})
  })
  default = {}
}
