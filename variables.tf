variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "vpc_id" {
  description = "The VPC for security groups of the action runners."
  type        = string
}

variable "subnet_ids" {
  description = "List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`."
  type        = list(string)
}

variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name and environment."
  type        = map(string)
  default     = {}
}

variable "environment" {
  description = "A name that identifies the environment, used as prefix and for tagging."
  type        = string
}

variable "enable_organization_runners" {
  description = "Register runners to organization, instead of repo level"
  type        = bool
  default     = false
}

variable "github_app" {
  description = "GitHub app parameters, see your github app. Ensure the key is the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`)."
  type = object({
    key_base64     = string
    id             = string
    client_id      = string
    client_secret  = string
    webhook_secret = string
  })
}

variable "scale_down_schedule_expression" {
  description = "Scheduler expression to check every x for scale down."
  type        = string
  default     = "cron(*/5 * * * ? *)"
}

variable "minimum_running_time_in_minutes" {
  description = "The time an ec2 action runner should be running at minimum before terminated if non busy."
  type        = number
  default     = 5
}

variable "runner_extra_labels" {
  description = "Extra labels for the runners (GitHub). Separate each label by a comma"
  type        = string
  default     = ""
}

variable "runner_group_name" {
  description = "Name of the runner group."
  type        = string
  default     = "Default"
}

variable "webhook_lambda_zip" {
  description = "File location of the webhook lambda zip file."
  type        = string
  default     = null
}

variable "webhook_lambda_timeout" {
  description = "Time out of the webhook lambda in seconds."
  type        = number
  default     = 10
}

variable "runners_lambda_zip" {
  description = "File location of the lambda zip file for scaling runners."
  type        = string
  default     = null
}

variable "runners_scale_up_lambda_timeout" {
  description = "Time out for the scale up lambda in seconds."
  type        = number
  default     = 180
}

variable "runners_scale_down_lambda_timeout" {
  description = "Time out for the scale down lambda in seconds."
  type        = number
  default     = 60
}

variable "runner_binaries_syncer_lambda_zip" {
  description = "File location of the binaries sync lambda zip file."
  type        = string
  default     = null
}

variable "runner_binaries_syncer_lambda_timeout" {
  description = "Time out of the binaries sync lambda in seconds."
  type        = number
  default     = 300
}

variable "role_permissions_boundary" {
  description = "Permissions boundary that will be added to the created roles."
  type        = string
  default     = null
}

variable "role_path" {
  description = "The path that will be added to role path for created roles, if not set the environment name will be used."
  type        = string
  default     = null
}

variable "instance_profile_path" {
  description = "The path that will be added to the instance_profile, if not set the environment name will be used."
  type        = string
  default     = null
}

variable "instance_type" {
  description = "[DEPRECATED] See instance_types."
  type        = string
  default     = "m5.large"
}

variable "runner_as_root" {
  description = "Run the action runner under the root user."
  type        = bool
  default     = false
}

variable "runners_maximum_count" {
  description = "The maximum number of runners that will be created."
  type        = number
  default     = 3
}

variable "kms_key_arn" {
  description = "Optional CMK Key ARN to be used for Parameter Store. This key must be in the current account."
  type        = string
  default     = null
}

variable "userdata_template" {
  description = "Alternative user-data template, replacing the default template. By providing your own user_data you have to take care of installing all required software, including the action runner. Variables userdata_pre/post_install are ignored."
  type        = string
  default     = null
}

variable "userdata_pre_install" {
  type        = string
  default     = ""
  description = "Script to be ran before the GitHub Actions runner is installed on the EC2 instances"
}

variable "userdata_post_install" {
  type        = string
  default     = ""
  description = "Script to be ran after the GitHub Actions runner is installed on the EC2 instances"
}

variable "idle_config" {
  description = "List of time period that can be defined as cron expression to keep a minimum amount of runners active instead of scaling down to 0. By defining this list you can ensure that in time periods that match the cron expression within 5 seconds a runner is kept idle."
  type = list(object({
    cron      = string
    timeZone  = string
    idleCount = number
  }))
  default = []
}

variable "enable_ssm_on_runners" {
  description = "Enable to allow access the runner instances for debugging purposes via SSM. Note that this adds additional permissions to the runner instances."
  type        = bool
  default     = false
}

variable "logging_retention_in_days" {
  description = "Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653."
  type        = number
  default     = 180
}

variable "runner_allow_prerelease_binaries" {
  description = "Allow the runners to update to prerelease binaries."
  type        = bool
  default     = false
}

variable "block_device_mappings" {
  description = "The EC2 instance block device configuration. Takes the following keys: `device_name`, `delete_on_termination`, `volume_type`, `volume_size`, `encrypted`, `iops`"
  type        = map(string)
  default     = {}
}

variable "ami_filter" {
  description = "List of maps used to create the AMI filter for the action runner AMI. By default amazon linux 2 is used."
  type        = map(list(string))

  default = {}
}
variable "ami_owners" {
  description = "The list of owners used to select the AMI of action runner instances."
  type        = list(string)
  default     = ["amazon"]
}
variable "lambda_s3_bucket" {
  description = "S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly."
  default     = null
}

variable "syncer_lambda_s3_key" {
  description = "S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas."
  default     = null
}

variable "syncer_lambda_s3_object_version" {
  description = "S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket."
  default     = null
}

variable "webhook_lambda_s3_key" {
  description = "S3 key for webhook lambda function. Required if using S3 bucket to specify lambdas."
  default     = null
}

variable "webhook_lambda_s3_object_version" {
  description = "S3 object version for webhook lambda function. Useful if S3 versioning is enabled on source bucket."
  default     = null
}

variable "runners_lambda_s3_key" {
  description = "S3 key for runners lambda function. Required if using S3 bucket to specify lambdas."
  default     = null
}

variable "runners_lambda_s3_object_version" {
  description = "S3 object version for runners lambda function. Useful if S3 versioning is enabled on source bucket."
  default     = null
}

variable "create_service_linked_role_spot" {
  description = "(optional) create the serviced linked role for spot instances that is required by the scale-up lambda."
  type        = bool
  default     = false
}

variable "runner_iam_role_managed_policy_arns" {
  description = "Attach AWS or customer-managed IAM policies (by ARN) to the runner IAM role"
  type        = list(string)
  default     = []
}

variable "enable_cloudwatch_agent" {
  description = "Enabling the cloudwatch agent on the ec2 runner instances, the runner contains default config. Configuration can be overridden via `cloudwatch_config`."
  type        = bool
  default     = true
}

variable "cloudwatch_config" {
  description = "(optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details."
  type        = string
  default     = null
}

variable "runner_log_files" {
  description = "(optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details."
  type = list(object({
    log_group_name   = string
    prefix_log_group = bool
    file_path        = string
    log_stream_name  = string
  }))
  default = [
    {
      "log_group_name" : "messages",
      "prefix_log_group" : true,
      "file_path" : "/var/log/messages",
      "log_stream_name" : "{instance_id}"
    },
    {
      "log_group_name" : "user_data",
      "prefix_log_group" : true,
      "file_path" : "/var/log/user-data.log",
      "log_stream_name" : "{instance_id}"
    },
    {
      "log_group_name" : "runner",
      "prefix_log_group" : true,
      "file_path" : "/home/ec2-user/actions-runner/_diag/Runner_**.log",
      "log_stream_name" : "{instance_id}"
    }
  ]
}

variable "ghes_url" {
  description = "GitHub Enterprise Server URL. Example: https://github.internal.co - DO NOT SET IF USING PUBLIC GITHUB"
  type        = string
  default     = null
}

variable "lambda_subnet_ids" {
  description = "List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`."
  type        = list(string)
  default     = []
}

variable "lambda_security_group_ids" {
  description = "List of security group IDs associated with the Lambda function."
  type        = list(string)
  default     = []
}

variable "key_name" {
  description = "Key pair name"
  type        = string
  default     = null
}

variable "runner_additional_security_group_ids" {
  description = "(optional) List of additional security groups IDs to apply to the runner"
  type        = list(string)
  default     = []
}

variable "market_options" {
  description = "Market options for the action runner instances. Setting the value to `null` let the scaler create on-demand instances instead of spot instances."
  type        = string
  default     = "spot"
}

variable "volume_size" {
  description = "Size of runner volume"
  type        = number
  default     = 30
}

variable "instance_types" {
  description = "List of instance types for the action runner."
  type        = set(string)
  default     = null
}

variable "repository_white_list" {
  description = "List of repositories allowed to use the github app"
  type        = list(string)
  default     = []
}

variable "delay_webhook_event" {
  description = "The number of seconds the event accepted by the webhook is invisible on the queue before the scale up lambda will receive the event."
  type        = number
  default     = 30
}
