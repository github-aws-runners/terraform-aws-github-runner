variable "github_app" {
  description = <<EOF
  GitHub app parameters, see your github app. 
  You can optionally create the SSM parameters yourself and provide the ARN and name here, through the `*_ssm` attributes.
  If you chose to provide the configuration values directly here, 
  please ensure the key is the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`).
  Note: the provided SSM parameters arn and name have a precedence over the actual value (i.e `key_base64_ssm` has a precedence over `key_base64` etc).
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
    condition     = (var.github_app.key_base64 != null || var.github_app.key_base64_ssm != null) && (var.github_app.id != null || var.github_app.id_ssm != null) && (var.github_app.webhook_secret != null || var.github_app.webhook_secret_ssm != null)
    error_message = <<EOF
     You must set all of the following parameters, choosing one option from each pair:
      - `key_base64` or `key_base64_ssm`
      - `id` or `id_ssm`
      - `webhook_secret` or `webhook_secret_ssm`
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
