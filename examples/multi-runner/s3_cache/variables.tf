variable "config" {
  type = object({
    aws_region       = string
    prefix           = string
    runner_role_arns = list(string)
    tags             = map(string)
    vpc_id           = string
  })
}
