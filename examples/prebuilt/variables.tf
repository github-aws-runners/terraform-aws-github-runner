variable "github_app" {
  description = "GitHub for API usages."

  type = object({
    id         = string
    key_base64 = string
  })
}

variable "runner_os" {
  type    = string
  default = "linux"
}

variable "ami_name_filter" {
  type    = string
  default = "github-runner-amzn2-x86_64-*"
}
