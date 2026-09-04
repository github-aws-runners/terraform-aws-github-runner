# Experimental global SSM configuration.
variable "experimental_global_config_ssm" {
  description = "Experimental global SSM configuration."
  type = object({
    paths = optional(object({
      root    = optional(string, null)
      app     = optional(string, "app")
      webhook = optional(string, "webhook")
      tokens  = optional(string, "runners/tokens")
      config  = optional(string, "runners/config")
    }), {})
    kms_key_id = optional(string, null)
    tags       = optional(map(string), {})
    parameters = optional(object({
      tags = optional(map(string), {})
    }), {})
    housekeeper = optional(object({
      schedule_expression = optional(string, "rate(1 day)")
      state               = optional(string, "ENABLED")
      tags                = optional(map(string), {})
      lambda = optional(object({
        artifact = optional(object({
          zip = optional(string, null)
          s3 = optional(object({
            key            = string
            object_version = optional(string, null)
          }), null)
        }), {})
        memory_size = optional(number, 512)
        timeout     = optional(number, 60)
      }), {})
      config = optional(object({
        tokenPath      = optional(string, null)
        minimumDaysOld = optional(number, 1)
        dryRun         = optional(bool, false)
      }), {})
    }), {})
  })
  default = {}
}
