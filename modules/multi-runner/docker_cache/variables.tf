variable "config" {
  type = object({
    prefix                    = string
    tags                      = map(string)
    vpc_id                    = string
    subnet_ids                = list(string)
    lambda_security_group_ids = list(string)
  })
}
