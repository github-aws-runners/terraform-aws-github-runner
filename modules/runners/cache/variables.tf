variable "config" {
  type = object({
    prefix = string
    tags = map(string)
    arn_runner_instance_role = string
  })
}
