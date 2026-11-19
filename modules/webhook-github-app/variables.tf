variable "github_app" {
  description = "GitHub app parameters, see your GitHub app. Provide the private key as `key_base64`, the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`), or as `key_base64_ssm`, an SSM parameter holding that value. The script reads the SSM parameter with the AWS CLI when it runs, so the key is not stored in plan or state. `key_base64_ssm` takes precedence over `key_base64`, and takes the same `{ arn, name }` object as the root module; only `arn` is used."
  type = object({
    key_base64     = optional(string)
    key_base64_ssm = optional(object({ arn = string, name = string }))
    id             = string
    webhook_secret = string
  })
  sensitive = true

  validation {
    condition     = var.github_app.key_base64 != null || var.github_app.key_base64_ssm != null
    error_message = "Set github_app.key_base64 or github_app.key_base64_ssm."
  }

  validation {
    # can() also absorbs the error from reading arn on a null key_base64_ssm
    condition     = var.github_app.key_base64_ssm == null || can(regex("^arn:aws[a-z-]*:ssm:[a-z0-9-]+:[0-9]{12}:parameter/", var.github_app.key_base64_ssm.arn))
    error_message = "github_app.key_base64_ssm.arn must be an SSM parameter ARN; the script reads the region from it."
  }
}

variable "ssm_assume_role_arn" {
  description = "IAM role the script assumes before reading `github_app.key_base64_ssm`. Set it when the shell running Terraform has different AWS credentials than the role allowed to read the parameter, for example when the AWS provider assumes a role."
  type        = string
  default     = null
}

variable "webhook_endpoint" {
  description = "The endpoint to use for the webhook, defaults to the endpoint of the runners module."
  type        = string
}
