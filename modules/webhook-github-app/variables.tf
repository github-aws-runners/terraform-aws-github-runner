variable "github_app" {
  description = "GitHub app parameters, see your github app. Ensure the key is the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`)."
  type = object({
    key_base64     = string
    id             = string
    webhook_secret = string
  })
}

variable "webhook_endpoint" {
  description = "The endpoint to use for the webhook, defaults to the endpoint of the runners module."
  type        = string
}
