variable "github_app" {
  description = <<EOF
  GitHub app parameters, see your github app.
  You can optionally create the SSM parameters yourself and provide the ARN and name here, through the `*_ssm` attributes.
  If you chose to provide the configuration values directly here,
  please ensure the key is the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`).
  Note: the provided SSM parameters arn and name have a precedence over the actual value (i.e `key_base64_ssm` has a precedence over `key_base64` etc).

  For enterprise runners, only `webhook_secret` (or `webhook_secret_ssm`) is required.
  The `key_base64` and `id` fields are only needed for org/repo level runners.
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
    condition     = var.github_app.webhook_secret != null || var.github_app.webhook_secret_ssm != null
    error_message = "You must set either `webhook_secret` or `webhook_secret_ssm`."
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

variable "enterprise_pat" {
  description = <<EOF
  Enterprise Personal Access Token(s) (PAT) for authenticating with GitHub Enterprise runner management APIs.
  You can either provide the PAT value directly (Terraform creates the SSM parameter) or reference a pre-existing SSM parameter.
  Note: the provided SSM parameter arn and name take precedence over the direct value.

  To distribute API calls across multiple PATs and avoid rate limiting, provide a comma-separated list of PATs
  in the 'pat' field or in the SSM parameter value. The Lambda functions will randomly select one PAT per invocation.
  EOF
  type = object({
    pat = optional(string)
    pat_ssm = optional(object({
      arn  = string
      name = string
    }))
  })
  default = null
}

