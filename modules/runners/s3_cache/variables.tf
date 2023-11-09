variable "config" {
  type = object({
    aws_region      = string
    expiration_days = number
    prefix          = string
    runner_instance_role = object({
      arn = string
    })
    cache_bucket_oidc_role = object({
      arn = string
    })
    tags   = map(string)
    vpc_id = string
  })
}
