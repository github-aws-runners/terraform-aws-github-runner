variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "environment" {
  description = "Environment name, used as prefix."

  type    = string
  default = null
}

variable "host_groups" {
  description = "Map of host groups, each with a name, host instance type, and a list of hosts (name + AZ)."
  type = map(object({
    name               = string
    host_instance_type = string
    hosts = list(object({
      name              = string
      availability_zone = string
    }))
  }))
}
