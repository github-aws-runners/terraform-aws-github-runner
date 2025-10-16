variable "enterprise_pat" {
  description = "GitHub enterprise PAT. Used only when enable_enterprise_runners is true."
  type        = string
  default     = null
}

variable "github_app" {
  description = <<EOF
  GitHub app parameters.
  EOF

  type = object({
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
  })

  validation {
    condition = (
      // 1) Webhook secret is ALWAYS required
      (var.github_app.webhook_secret != null || var.github_app.webhook_secret_ssm != null)
      &&
      // 2) Branch on enable_enterprise_runners
      (
        // A) Enterprise runners enabled -> PAT required, App creds must be absent
        (
          var.enable_enterprise_runners == true &&
          var.enterprise_pat != null &&
          var.github_app.key_base64 == null &&
          var.github_app.key_base64_ssm == null &&
          var.github_app.id == null &&
          var.github_app.id_ssm == null
        )
        ||
        // B) Enterprise runners disabled -> App creds required, PAT must be absent
        (
          var.enable_enterprise_runners == false &&
          var.enterprise_pat == null &&
          (var.github_app.key_base64 != null || var.github_app.key_base64_ssm != null) &&
          (var.github_app.id != null || var.github_app.id_ssm != null)
        )
      )
    )

    error_message = <<EOF
webhook_secret is required: set either `webhook_secret` or `webhook_secret_ssm`.

When enable_enterprise_runners = true:
  - Set `enterprise_pat`
  - Do NOT set GitHub App `key_base64/_ssm` or `id/_ssm`

When enable_enterprise_runners = false:
  - Do NOT set `enterprise_pat`
  - Provide GitHub App credentials: `key_base64` or `key_base64_ssm` AND `id` or `id_ssm`
EOF
  }
}


variable "path_prefix" {
  description = "The path prefix used for naming resources"
  type        = string
}

variable "kms_key_arn" {
  description = "Optional CMK Key ARN to be used for Parameter Store."
  type        = string
  default     = null
}

variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name and environment."
  type        = map(string)
  default     = {}
}
