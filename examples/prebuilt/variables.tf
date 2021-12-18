
variable "github_app_key_base64" {}

variable "github_app_id" {}

variable "runner_os" {
  type    = string
  default = "linux"
}

variable "ami_name_filter" {
  type    = string
  default = "github-runner-amzn2-x86_64-2021*"
}

variable "aws_region" {
  type    = string
  default = "eu-west-1"
}