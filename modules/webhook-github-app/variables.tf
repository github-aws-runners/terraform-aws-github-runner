variable "github_app" {
  description = "GitHub app parameters, see your GitHub app. Provide the private key as `key_base64`, the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`), or as `key_base64_ssm`, an SSM parameter holding that value. The SSM value is read with an ephemeral resource and is not stored in plan or state."
  type = object({
    key_base64     = optional(string)
    key_base64_ssm = optional(object({ arn = string, name = string }))
    id             = string
    webhook_secret = string
  })
  sensitive = true

  validation {
    condition     = (var.github_app.key_base64 == null) != (var.github_app.key_base64_ssm == null)
    error_message = "Set exactly one of github_app.key_base64 or github_app.key_base64_ssm."
  }
}

variable "webhook_endpoint" {
  description = "The endpoint to use for the webhook, defaults to the endpoint of the runners module."
  type        = string
}
