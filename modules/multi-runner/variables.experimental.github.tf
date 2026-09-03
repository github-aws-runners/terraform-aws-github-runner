# Experimental global GitHub configuration.
variable "experimental_global_config_github" {
  description = "Experimental global GitHub configuration."
  type = object({
    app = optional(object({
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
    }), null)
    additional_apps = optional(list(object({
      key_base64          = optional(string)
      key_base64_ssm      = optional(object({ arn = string, name = string }))
      id                  = optional(string)
      id_ssm              = optional(object({ arn = string, name = string }))
      installation_id     = optional(string)
      installation_id_ssm = optional(object({ arn = string, name = string }))
    })), [])
    enterprise_server = optional(object({
      url        = optional(string, null)
      ssl_verify = optional(bool, true)
    }), {})
    user_agent = optional(string, "github-aws-runners")
  })
  default = {}
}
