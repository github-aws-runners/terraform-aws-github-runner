
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
  default     = "rate(1 day)"
}

variable "ami_housekeeper_cleanup_config" {
  description = <<EOF
    Configuration for AMI cleanup.

    `amiFilters` - Filters to use when searching for AMIs to cleanup. Default filter for images owned by the account and that are available.
    `dryRun` - If true, no AMIs will be deregistered. Default false.
    `launchTemplateNames` - Launch template names to use when searching for AMIs to cleanup. Default no launch templates.
    `maxItems` - The maximum numer of AMI's tha will be queried for cleanup. Default no maximum.
    `minimumDaysOld` - Minimum number of days old an AMI must be to be considered for cleanup. Default 30.
    `ssmParameterNames` - SSM parameter names to use when searching for AMIs to cleanup. This parameter should be set when using SSM to configure the AMI to use. Default no SSM parameters.
  EOF
  type = object({
    amiFilters = optional(list(object({
      Name   = string
      Values = list(string)
      })),
      [{
        Name : "state",
        Values : ["available"],
        },
        {
          Name : "image-type",
          Values : ["machine"],
      }]
    )
    dryRun              = optional(bool, false)
    launchTemplateNames = optional(list(string))
    maxItems            = optional(number)
    minimumDaysOld      = optional(number, 30)
    ssmParameterNames   = optional(list(string))
  })
  default = {}
}
