variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "vpc_id" {
  description = "The VPC for the security groupss."
  type        = string
}

variable "subnet_ids" {
  description = "List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`."
  type        = list(string)
}

variable "overrides" {
  description = "This maps provides the possibility to override some defaults. The following attributes are supported: `name_sg` overwrite the `Name` tag for all security groups created by this module. `name_runner_agent_instance` override the `Name` tag for the ec2 instance defined in the auto launch configuration. `name_docker_machine_runners` ovverrid the `Name` tag spot instances created by the runner agent."
  type        = map(string)

  default = {
    name_runner = ""
    name_sg     = ""
  }
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

variable "s3_bucket_runner_binaries" {
  type = object({
    arn = string
  })
}


variable "s3_location_runner_binaries" {
  description = "S3 location of runner distribution."
  type        = string
}

variable "block_device_mappings" {
  description = "The EC2 instance block device configuration. Takes the following keys: `delete_on_termination`, `volume_type`, `volume_size`, `encrypted`, `iops`"
  type        = map(string)
  default     = {}
}

variable "market_options" {
  description = "Market options for the action runner instances."
  type        = string
  default     = "spot"
}

variable "instance_type" {
  description = "Default instance type for the action runner."
  type        = string
  default     = "m5.large"
}

variable "ami_filter" {
  description = "List of maps used to create the AMI filter for the action runner AMI."
  type        = map(list(string))

  default = {
    name = ["amzn2-ami-hvm-2.*-x86_64-ebs"]
  }
}

variable "ami_owners" {
  description = "The list of owners used to select the AMI of action runner instances."
  type        = list(string)
  default     = ["amazon"]
}


variable "userdata_pre_install" {
  description = "User-data script snippet to insert before GitHub acton runner install"
  type        = string
  default     = ""
}

variable "userdata_post_install" {
  description = "User-data script snippet to insert after GitHub acton runner install"
  type        = string
  default     = ""
}

variable "sqs_build_queue" {
  description = "SQS queue to consume accepted build events."
  type = object({
    arn = string
  })
}

variable "enable_organization_runners" {
  type = bool
}

variable "github_app" {
  description = "GitHub app parameters, see your github aapp. Ensure the key is base64 encoded."
  type = object({
    key_base64    = string
    id            = string
    client_id     = string
    client_secret = string
  })
}


variable "scale_down_schedule_expression" {
  description = "Scheduler expression to check every x for scale down."
  type        = string
  default     = "cron(*/5 * * * ? *)"
}

variable "minimum_running_time_in_minutes" {
  description = "The time an ec2 action runner should be running at minium before terminated if non busy."
  type        = number
  default     = 5
}

variable "runner_extra_labels" {
  description = "Extra labels for the runners (GitHub). Separate each label by a comma"
  type        = string
  default     = ""
}

variable "lambda_zip" {
  description = "File location of the lambda zip file."
  type        = string
  default     = null
}

variable "lambda_timeout_scale_down" {
  description = "Time out for the scale down lambda in seconds."
  type        = number
  default     = 60
}

variable "lambda_timeout_scale_up" {
  description = "Time out for the scale up lambda in seconds."
  type        = number
  default     = 60
}

variable "role_permissions_boundary" {
  description = "Permissions boundary that will be added to the created role for the lambda."
  type        = string
  default     = null
}

variable "role_path" {
  description = "The path that will be added to the role, if not set the environment name will be used."
  type        = string
  default     = null
}

variable "instance_profile_path" {
  description = "The path that will be added to the instance_profile, if not set the environment name will be used."
  type        = string
  default     = null
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

variable "encryption" {
  description = "KMS key to encrypted lambda environment secrets. Either provide a key and `ecnrypt` set to `true`. Or set the key to `null` and encrypt to `false`."
  type = object({
    kms_key_id = string
    encrypt    = bool
  })
}
