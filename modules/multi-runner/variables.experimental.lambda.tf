# Global Lambda configuration.
variable "global_config_lambda" {
  description = "Global Lambda configuration."
  type = object({
    artifact = optional(object({
      s3 = optional(object({
        bucket = optional(string, null)
      }), {})
    }), {})
    runtime      = optional(string, "nodejs24.x")
    architecture = optional(string, "arm64")
    principals = optional(list(object({
      type        = string
      identifiers = list(string)
    })), [])
    subnet_ids         = optional(list(string), [])
    security_group_ids = optional(list(string), [])
    tags               = optional(map(string), {})
    role = optional(object({
      path                 = optional(string, null)
      permissions_boundary = optional(string, null)
    }), {})
  })
  default = {}
}
