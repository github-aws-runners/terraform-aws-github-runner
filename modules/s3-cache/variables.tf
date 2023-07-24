variable "bucket_name" {
  description = "Name of the s3 bucket. Must be unique."
  type        = string
}

variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name and environment."
  type        = map(string)
  default     = {}
}

# variable "runner_role" {
#   description = "Name of the IAM role that will be used by runners to access the cache."
#   type        = string
#   default     = "runner-role"
# }
