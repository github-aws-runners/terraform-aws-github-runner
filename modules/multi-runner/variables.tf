variable "github_app" {
  description = "GitHub app parameters, see your github app. Ensure the key is the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`)."
  type = object({
    key_base64     = string
    id             = string
    webhook_secret = string
  })
}

variable "environment" {
  description = "A name that identifies the environment, used as prefix and for tagging."
  type        = string
  default     = null

  validation {
    condition     = var.environment == null
    error_message = "The \"environment\" variable is no longer used. To migrate, set the \"prefix\" variable to the original value of \"environment\" and optionally, add \"Environment\" to the \"tags\" variable map with the same value."
  }
}

variable "prefix" {
  description = "The prefix used for naming resources"
  type        = string
  default     = "github-actions"
}

variable "kms_key_arn" {
  description = "Optional CMK Key ARN to be used for Parameter Store."
  type        = string
  default     = null
}

variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name and environment."
  type        = map(string)
  default     = {}
}

variable "delay_webhook_event" {
  description = "The number of seconds the event accepted by the webhook is invisible on the queue before the scale up lambda will receive the event."
  type        = number
  default     = 30
}

variable "runner_extra_labels" {
  description = "Extra (custom) labels for the runners (GitHub). Separate each label by a comma. Labels checks on the webhook can be enforced by setting `enable_workflow_job_labels_check`. GitHub read-only labels should not be provided."
  type        = string
  default     = ""
}

variable "multi_runner_config" {
  description = "Configuration for all supported runners."
  type = map(object({
    runner_config = object({
      enable_runner_binaries_syncer = optional(bool, true)
      runner_os                     = string
      runner_architecture           = string
      runner_metadata_options = optional(map(any), {
        http_endpoint               = "enabled"
        http_tokens                 = "optional"
        http_put_response_hop_limit = 1
      })
      pool_runner_owner                       = optional(string, null)
      create_service_linked_role_spot         = optional(bool, false)
      disable_runner_autoupdate               = optional(bool, false)
      enable_ephemeral_runners                = optional(bool, false)
      enable_organization_runners             = optional(bool, false)
      enable_ssm_on_runners                   = optional(bool, false)
      instance_types                          = list(string)
      runner_group_name                       = optional(string, "Default")
      runner_extra_labels                     = string
      runners_maximum_count                   = number
      runner_run_as                           = optional(string, "ec2-user")
      scale_down_schedule_expression          = optional(string, "cron(*/5 * * * ? *)")
      minimum_running_time_in_minutes         = optional(number, null)
      runner_as_root                          = optional(bool, false)
      runner_boot_time_in_minutes             = optional(number, 5)
      delay_webhook_event                     = optional(number, 30)
      instance_target_capacity_type           = optional(string, "spot")
      instance_allocation_strategy            = optional(string, "lowest-price")
      instance_max_spot_price                 = optional(string, null)
      idle_config                             = optional(list(string), [])
      scale_up_reserved_concurrent_executions = optional(number, 1)
      enabled_userdata                        = optional(bool, true)
      runner_log_files = optional(list(object({
        log_group_name   = string
        prefix_log_group = bool
        file_path        = string
        log_stream_name  = string
      })), null)
      block_device_mappings = optional(list(object({
        delete_on_termination = bool
        device_name           = string
        encrypted             = bool
        iops                  = number
        kms_key_id            = string
        snapshot_id           = string
        throughput            = number
        volume_size           = number
        volume_type           = string
        })), [{
        delete_on_termination = true
        device_name           = "/dev/xvda"
        encrypted             = true
        iops                  = null
        kms_key_id            = null
        snapshot_id           = null
        throughput            = null
        volume_size           = 30
        volume_type           = "gp3"
      }])
      ami_filter              = optional(map(list(string)), null)
      ami_owners              = optional(list(string), ["amazon"])
      userdata_template       = optional(string, null)
      enable_job_queued_check = optional(bool, null)
      pool_config = optional(list(object({
        schedule_expression = string
        size                = number
      })), [])
    })
    labelMatchers = list(string)
    exactMatch    = optional(bool, false)
    fifo          = optional(bool, false)
    redrive_build_queue = optional(object({
      enabled         = bool
      maxReceiveCount = number
      }), {
      enabled         = false
      maxReceiveCount = null
    })
  }))

}

variable "runners_scale_up_lambda_timeout" {
  description = "Time out for the scale up lambda in seconds."
  type        = number
  default     = 30
}

variable "runners_scale_down_lambda_timeout" {
  description = "Time out for the scale down lambda in seconds."
  type        = number
  default     = 60
}

variable "webhook_lambda_zip" {
  description = "File location of the webhook lambda zip file."
  type        = string
  default     = null
}

variable "webhook_lambda_timeout" {
  description = "Time out of the lambda in seconds."
  type        = number
  default     = 10
}

variable "role_permissions_boundary" {
  description = "Permissions boundary that will be added to the created role for the lambda."
  type        = string
  default     = null
}

variable "role_path" {
  description = "The path that will be added to the role; if not set, the environment name will be used."
  type        = string
  default     = null
}

variable "logging_retention_in_days" {
  description = "Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653."
  type        = number
  default     = 7
}

variable "logging_kms_key_id" {
  description = "Specifies the kms key id to encrypt the logs with"
  type        = string
  default     = null
}

variable "lambda_s3_bucket" {
  description = "S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly."
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

variable "webhook_lambda_apigateway_access_log_settings" {
  description = "Access log settings for webhook API gateway."
  type = object({
    destination_arn = string
    format          = string
  })
  default = null
}

variable "repository_white_list" {
  description = "List of repositories allowed to use the github app"
  type        = list(string)
  default     = []
}

variable "log_type" {
  description = "Logging format for lambda logging. Valid values are 'json', 'pretty', 'hidden'. "
  type        = string
  default     = "pretty"
  validation {
    condition = anytrue([
      var.log_type == "json",
      var.log_type == "pretty",
      var.log_type == "hidden",
    ])
    error_message = "`log_type` value not valid. Valid values are 'json', 'pretty', 'hidden'."
  }
}

variable "log_level" {
  description = "Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'."
  type        = string
  default     = "info"
  validation {
    condition = anytrue([
      var.log_level == "silly",
      var.log_level == "trace",
      var.log_level == "debug",
      var.log_level == "info",
      var.log_level == "warn",
      var.log_level == "error",
      var.log_level == "fatal",
    ])
    error_message = "`log_level` value not valid. Valid values are 'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'."
  }
}

variable "lambda_runtime" {
  description = "AWS Lambda runtime."
  type        = string
  default     = "nodejs16.x"
}

variable "lambda_architecture" {
  description = "AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86_64' functions. "
  type        = string
  default     = "x86_64"
  validation {
    condition     = contains(["arm64", "x86_64"], var.lambda_architecture)
    error_message = "`lambda_architecture` value is not valid, valid values are: `arm64` and `x86_64`."
  }
}

variable "runner_allow_prerelease_binaries" {
  description = "Allow the runners to update to prerelease binaries."
  type        = bool
  default     = false
}

variable "syncer_lambda_s3_key" {
  description = "S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas."
  default     = null
}

variable "lambda_principals" {
  description = "(Optional) add extra principals to the role created for execution of the lambda, e.g. for local testing."
  type = list(object({
    type        = string
    identifiers = list(string)
  }))
  default = []
}

variable "runner_binaries_s3_sse_configuration" {
  description = "Map containing server-side encryption configuration for runner-binaries S3 bucket."
  type        = any
  default     = {}
}

variable "runner_binaries_syncer_lambda_timeout" {
  description = "Time out of the binaries sync lambda in seconds."
  type        = number
  default     = 300
}

variable "runner_binaries_syncer_lambda_zip" {
  description = "File location of the binaries sync lambda zip file."
  type        = string
  default     = null
}

variable "syncer_lambda_s3_object_version" {
  description = "S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket."
  default     = null
}

variable "queue_encryption" {
  description = "Configure how data on queues managed by the modules in ecrypted at REST. Options are encryped via SSE, non encrypted and via KMSS. By default encryptes via SSE is enabled. See for more details the Terraform `aws_sqs_queue` resource https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue."
  type = object({
    kms_data_key_reuse_period_seconds = number
    kms_master_key_id                 = string
    sqs_managed_sse_enabled           = bool
  })
  default = {
    kms_data_key_reuse_period_seconds = null
    kms_master_key_id                 = null
    sqs_managed_sse_enabled           = true
  }
  validation {
    condition     = var.queue_encryption == null || var.queue_encryption.sqs_managed_sse_enabled != null && var.queue_encryption.kms_master_key_id == null && var.queue_encryption.kms_data_key_reuse_period_seconds == null || var.queue_encryption.sqs_managed_sse_enabled == null && var.queue_encryption.kms_master_key_id != null
    error_message = "Invalid configuration for `queue_encryption`. Valid configurations are encryption disabled, enabled via SSE. Or encryption via KMS."
  }
}

variable "job_queue_retention_in_seconds" {
  description = "The number of seconds the job is held in the queue before it is purged"
  type        = number
  default     = 86400
}

variable "aws_partition" {
  description = "(optiona) partition in the arn namespace to use if not 'aws'"
  type        = string
  default     = "aws"
}

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

variable "enable_managed_runner_security_group" {
  description = "Enabling the default managed security group creation. Unmanaged security groups can be specified via `runner_additional_security_group_ids`."
  type        = bool
  default     = true
}

variable "enable_runner_detailed_monitoring" {
  description = "Should detailed monitoring be enabled for the runner. Set this to true if you want to use detailed monitoring. See https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-cloudwatch-new.html for details."
  type        = bool
  default     = false
}

variable "runner_egress_rules" {
  description = "List of egress rules for the GitHub runner instances."
  type = list(object({
    cidr_blocks      = list(string)
    ipv6_cidr_blocks = list(string)
    prefix_list_ids  = list(string)
    from_port        = number
    protocol         = string
    security_groups  = list(string)
    self             = bool
    to_port          = number
    description      = string
  }))
  default = [{
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
    prefix_list_ids  = null
    from_port        = 0
    protocol         = "-1"
    security_groups  = null
    self             = null
    to_port          = 0
    description      = null
  }]
}

variable "runner_additional_security_group_ids" {
  description = "(optional) List of additional security groups IDs to apply to the runner"
  type        = list(string)
  default     = []
}

variable "runners_lambda_s3_key" {
  description = "S3 key for runners lambda function. Required if using S3 bucket to specify lambdas."
  default     = null
}

variable "runners_lambda_s3_object_version" {
  description = "S3 object version for runners lambda function. Useful if S3 versioning is enabled on source bucket."
  default     = null
}

variable "runners_lambda_zip" {
  description = "File location of the lambda zip file for scaling runners."
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

variable "instance_profile_path" {
  description = "The path that will be added to the instance_profile, if not set the environment name will be used."
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

variable "key_name" {
  description = "Key pair name"
  type        = string
  default     = null
}

variable "runner_ec2_tags" {
  description = "Map of tags that will be added to the launch template instance tag specifications."
  type        = map(string)
  default     = {}
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

variable "ghes_url" {
  description = "GitHub Enterprise Server URL. Example: https://github.internal.co - DO NOT SET IF USING PUBLIC GITHUB"
  type        = string
  default     = null
}

variable "ghes_ssl_verify" {
  description = "GitHub Enterprise SSL verification. Set to 'false' when custom certificate (chains) is used for GitHub Enterprise Server (insecure)."
  type        = bool
  default     = true
}

variable "pool_lambda_timeout" {
  description = "Time out for the pool lambda in seconds."
  type        = number
  default     = 60
}

variable "pool_lambda_reserved_concurrent_executions" {
  description = "Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations."
  type        = number
  default     = 1
}
