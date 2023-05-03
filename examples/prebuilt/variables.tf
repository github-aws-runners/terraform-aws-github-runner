variable "github_app" {
  description = "GitHub for API usages."

  type = object({
    id         = string
    key_base64 = string
  })
}

variable "runner_os" {
  description = "The EC2 Operating System type to use for action runner instances (linux,windows)."

  type    = string
  default = "linux"
}

variable "ami_name_filter" {
  description = "AMI name filter for the action runner AMI. By default amazon linux 2 is used."

  type    = string
  default = "github-runner-amzn2-x86_64-*"
}
