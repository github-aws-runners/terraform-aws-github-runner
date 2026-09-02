variable "github_app" {
  description = "GitHub for API usages."

  type = object({
    id         = string
    key_base64 = string
  })
}

variable "ami" {
  description = "AMI lookup configuration passed to the runner module."

  type = object({
    filter               = optional(map(list(string)), { state = ["available"] })
    owners               = optional(list(string), ["amazon"])
    id_ssm_parameter_arn = optional(string, null)
    kms_key_arn          = optional(string, null)
  })

  default = null
}

variable "ami_housekeeper_lambda_zip" {
  description = "File location of the AMI housekeeper Lambda zip file."
  type        = string
  default     = null
}

variable "runner_binaries_syncer_lambda_zip" {
  description = "File location of the runner binaries syncer Lambda zip file."
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

variable "termination_watcher_lambda_zip" {
  description = "File location of the termination watcher Lambda zip file."
  type        = string
  default     = null
}

variable "instance_termination_watcher_enabled" {
  description = "Whether to enable the instance termination watcher."
  type        = bool
  default     = true
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
