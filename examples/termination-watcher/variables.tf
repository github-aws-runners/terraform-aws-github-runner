variable "config" {
  description = "Configuration for the spot termination watcher."
  type        = any
}

variable "aws_region" {
  description = "AWS region."
  type        = string
  default     = "eu-west-1"
}

variable "aws_access_key" {
  description = "Optional AWS access key for the provider."
  type        = string
  default     = null
}

variable "aws_secret_key" {
  description = "Optional AWS secret key for the provider."
  type        = string
  sensitive   = true
  default     = null
}

variable "skip_credentials_validation" {
  description = "Skip AWS credential validation."
  type        = bool
  default     = false
}

variable "skip_metadata_api_check" {
  description = "Skip the EC2 metadata API check."
  type        = bool
  default     = false
}

variable "skip_region_validation" {
  description = "Skip AWS region validation."
  type        = bool
  default     = false
}

variable "skip_requesting_account_id" {
  description = "Skip requesting the AWS account ID."
  type        = bool
  default     = false
}

variable "s3_use_path_style" {
  description = "Use path-style S3 requests."
  type        = bool
  default     = false
}
