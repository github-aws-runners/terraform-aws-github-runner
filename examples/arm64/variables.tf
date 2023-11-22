variable "github_app" {
  description = "GitHub App for API usages."

  type = object({
    id         = string
    key_base64 = string
  })
}
