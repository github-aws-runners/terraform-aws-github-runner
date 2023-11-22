
variable "enable_ami_housekeeper" {
  description = "Option to disable the lambda to clean up old AMIs."
  type        = bool
  default     = false
}

variable "ami_housekeeper_lambda_zip" {
  description = "File location of the lambda zip file."
  type        = string
  default     = null
}

variable "ami_housekeeper_lambda_timeout" {
  description = "Time out of the lambda in seconds."
  type        = number
  default     = 300
}

variable "ami_housekeeper_lambda_s3_key" {
  description = "S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas."
  type        = string
  default     = null
}

variable "ami_housekeeper_lambda_s3_object_version" {
  description = "S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket."
  type        = string
  default     = null
}

variable "ami_housekeeper_lambda_schedule_expression" {
  description = "Scheduler expression for action runner binary syncer."
  type        = string
  default     = "cron(11 7 * * ? *)" # once a day
}

variable "ami_housekeeper_cleanup_config" {
  description = "Configuration for AMI cleanup."
  type = object({
    maxItems       = optional(number)
    minimumDaysOld = optional(number)
    amiFilters = optional(list(object({
      Name   = string
      Values = list(string)
    })))
    launchTemplateNames = optional(list(string))
    ssmParameterNames   = optional(list(string))
    dryRun              = optional(bool)
  })
  default = {}
}
