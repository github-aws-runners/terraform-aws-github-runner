variable "config" {
  type = object({
    aws_region = string
    vpc_id     = string
  })
}
