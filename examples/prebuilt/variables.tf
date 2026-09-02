variable "github_app" {
  description = "GitHub for API usages."

  type = object({
    id         = string
    key_base64 = string
  })
}

variable "ami_housekeeper_lambda_zip" {
  description = "File location of the AMI housekeeper Lambda zip file."
  type        = string
  default     = null
}

variable "runners_lambda_zip" {
  description = "File location of the runners Lambda zip file."
  type        = string
  default     = null
}

variable "webhook_lambda_zip" {
  description = "File location of the webhook Lambda zip file."
  type        = string
  default     = null
}

variable "enable_webhook_github_app" {
  description = "Whether to configure the GitHub App webhook with GitHub."
  type        = bool
  default     = true
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

variable "environment" {
  description = "Environment name, used as prefix."

  type    = string
  default = null
}

variable "aws_region" {
  description = "AWS region."

  type    = string
  default = "eu-west-1"
}

variable "runner_os" {
  description = "The EC2 Operating System type to use for action runner instances (linux, osx, windows)."

  type    = string
  default = "linux"
}

variable "ami_name_filter" {
  description = "AMI name filter for the action runner AMI. By default amazon linux 2 is used."

  type    = string
  default = "github-runner-al2023-x86_64-*"
}
