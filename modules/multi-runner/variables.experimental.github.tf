# Global GitHub configuration.
variable "global_config_github" {
  description = <<-EOT
    Global GitHub configuration shared by all runner lanes.

    global_config_github = {
      app: {
        key_base64: "Base64-encoded GitHub App private key."
        key_base64_ssm: "SSM parameter containing the Base64-encoded GitHub App private key."
        key_base64_ssm.arn: "ARN of the SSM parameter containing the GitHub App private key."
        key_base64_ssm.name: "Name of the SSM parameter containing the GitHub App private key."
        id: "GitHub App ID."
        id_ssm: "SSM parameter containing the GitHub App ID."
        id_ssm.arn: "ARN of the SSM parameter containing the GitHub App ID."
        id_ssm.name: "Name of the SSM parameter containing the GitHub App ID."
        installation_id: "GitHub App installation ID for the primary scale-set installation."
        installation_id_ssm: "SSM parameter containing the primary GitHub App installation ID."
        installation_id_ssm.arn: "ARN of the SSM parameter containing the primary GitHub App installation ID."
        installation_id_ssm.name: "Name of the SSM parameter containing the primary GitHub App installation ID."
        webhook_secret: "GitHub App webhook secret."
        webhook_secret_ssm: "SSM parameter containing the GitHub App webhook secret."
        webhook_secret_ssm.arn: "ARN of the SSM parameter containing the GitHub App webhook secret."
        webhook_secret_ssm.name: "Name of the SSM parameter containing the GitHub App webhook secret."
      }
      config_url: "GitHub organization or repository URL shared by all scale-set runner lanes."
      additional_apps: "Additional GitHub Apps used to distribute GitHub API requests."
      additional_apps.key_base64: "Base64-encoded private key for an additional GitHub App."
      additional_apps.key_base64_ssm: "SSM parameter containing an additional App private key."
      additional_apps.key_base64_ssm.arn: "ARN of the SSM parameter containing an additional App private key."
      additional_apps.key_base64_ssm.name: "Name of the SSM parameter containing an additional App private key."
      additional_apps.id: "ID of an additional GitHub App."
      additional_apps.id_ssm: "SSM parameter containing an additional GitHub App ID."
      additional_apps.id_ssm.arn: "ARN of the SSM parameter containing an additional GitHub App ID."
      additional_apps.id_ssm.name: "Name of the SSM parameter containing an additional GitHub App ID."
      additional_apps.installation_id: "Optional installation ID for an additional GitHub App."
      additional_apps.installation_id_ssm: "SSM parameter containing an additional App installation ID."
      additional_apps.installation_id_ssm.arn: "ARN of the SSM parameter containing an additional App installation ID."
      additional_apps.installation_id_ssm.name: "Name of the SSM parameter containing an additional App installation ID."
      enterprise_server.url: "GitHub Enterprise Server URL."
      enterprise_server.ssl_verify: "Whether to verify the GitHub Enterprise Server TLS certificate."
      user_agent: "User-Agent value sent with GitHub API requests."
    }
  EOT
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
      installation_id = optional(string)
      installation_id_ssm = optional(object({
        arn  = string
        name = string
      }))
      webhook_secret = optional(string)
      webhook_secret_ssm = optional(object({
        arn  = string
        name = string
      }))
    }), null)
    config_url = optional(string, null)
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
