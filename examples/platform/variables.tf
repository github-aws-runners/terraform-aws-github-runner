variable "github_app" {
  description = "GitHub for API usages."

  type = object({
    id         = string
    key_base64 = string
  })

  default = {
    id = 000000
    key_base64 = <<EOT
insert base64 app key here
EOT
  }
}

variable "runner_os" {
  type    = string
  default = "linux"
}

variable "runner_run_as" {
  type    = string
  default = "ubuntu"
}

variable "ami_name_filter" {
  type    = string
  default = "github-runner-ubuntu-jammy-platform-amd64-202307070322"
}

variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "instance_types" {
  type    = list(string)
  default = ["c6id.4xlarge"]
}
