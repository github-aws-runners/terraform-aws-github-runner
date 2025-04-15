variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "vpc_id" {
  description = "The VPC for security groups of the action runners."
  type        = string
}

variable "subnet_ids" {
  description = "List of subnets in which the action runner instances will be launched. The subnets need to exist in the configured VPC (`vpc_id`), and must reside in different availability zones (see https://github.com/github-aws-runners/terraform-aws-github-runner/issues/2904)"
  type        = list(string)
}

variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name and environment."
  type        = map(string)
  default     = {}
}

variable "prefix" {
  description = "The prefix used for naming resources"
  type        = string
  default     = "github-actions"
}

variable "enable_organization_runners" {
  description = "Register runners to organization, instead of repo level"
  type        = bool
  default     = false
}

variable "github_app" {
  description = <<EOF
  GitHub app parameters, see your github app.
  You can optionally create the SSM parameters yourself and provide the ARN and name here, through the `*_ssm` attributes.
  If you chose to provide the configuration values directly here,
  please ensure the key is the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`).
  Note: the provided SSM parameters arn and name have a precedence over the actual value (i.e `key_base64_ssm` has a precedence over `key_base64` etc).
  EOF
  type = object({
    key_base64 = optional(string)
    key_base64_ssm = optional(object({
      arn  = string
      name = string
    }))
    id = optional(string)
    id_ssm = optional(object({
      arn  = string
      name = string
    }))
    webhook_secret = optional(string)
    webhook_secret_ssm = optional(object({
      arn  = string
      name = string
    }))
  })
  validation {
    condition     = (var.github_app.key_base64 != null || var.github_app.key_base64_ssm != null) && (var.github_app.id != null || var.github_app.id_ssm != null) && (var.github_app.webhook_secret != null || var.github_app.webhook_secret_ssm != null)
    error_message = <<EOF
     You must set all of the following parameters, choosing one option from each pair:
      - `key_base64` or `key_base64_ssm`
      - `id` or `id_ssm`
      - `webhook_secret` or `webhook_secret_ssm`
    EOF
  }
}

variable "scale_down_schedule_expression" {
  description = "Scheduler expression to check every x for scale down."
  type        = string
  default     = "cron(*/5 * * * ? *)"
}

variable "minimum_running_time_in_minutes" {
  description = "The time an ec2 action runner should be running at minimum before terminated, if not busy."
  type        = number
  default     = null
}

variable "runner_boot_time_in_minutes" {
  description = "The minimum time for an EC2 runner to boot and register as a runner."
  type        = number
  default     = 5
}

variable "runner_disable_default_labels" {
  description = "Disable default labels for the runners (os, architecture and `self-hosted`). If enabled, the runner will only have the extra labels provided in `runner_extra_labels`. In case you on own start script is used, this configuration parameter needs to be parsed via SSM."
  type        = bool
  default     = false
}

variable "runner_extra_labels" {
  description = "Extra (custom) labels for the runners (GitHub). Separate each label by a comma. Labels checks on the webhook can be enforced by setting `enable_workflow_job_labels_check`. GitHub read-only labels should not be provided."
  type        = list(string)
  default     = []

  validation {
    condition     = var.runner_extra_labels != null
    error_message = "Extra labels should not be null."
  }
}

variable "runner_group_name" {
  description = "Name of the runner group."
  type        = string
  default     = "Default"
}

variable "scale_up_reserved_concurrent_executions" {
  description = "Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations."
  type        = number
  default     = 1
}

variable "webhook_lambda_zip" {
  description = "File location of the webhook lambda zip file."
  type        = string
  default     = null
}

variable "webhook_lambda_memory_size" {
  description = "Memory size limit in MB for webhook lambda in."
  type        = number
  default     = 256
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

variable "runners_scale_up_lambda_memory_size" {
  description = "Memory size limit in MB for scale-up lambda."
  type        = number
  default     = 512
}

variable "runners_scale_up_lambda_timeout" {
  description = "Time out for the scale up lambda in seconds."
  type        = number
  default     = 30
}

variable "runners_scale_down_lambda_memory_size" {
  description = "Memory size limit in MB for scale-down lambda."
  type        = number
  default     = 512
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

variable "runner_binaries_syncer_lambda_memory_size" {
  description = "Memory size limit in MB for binary syncer lambda."
  type        = number
  default     = 256
}

variable "runner_binaries_syncer_lambda_timeout" {
  description = "Time out of the binaries sync lambda in seconds."
  type        = number
  default     = 300
}

variable "runner_binaries_s3_sse_configuration" {
  description = "Map containing server-side encryption configuration for runner-binaries S3 bucket."
  type        = any
  default = {
    rule = {
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
    }
  }
}

variable "runner_binaries_s3_versioning" {
  description = "Status of S3 versioning for runner-binaries S3 bucket. Once set to Enabled the change cannot be reverted via Terraform!"
  type        = string
  default     = "Disabled"
}

variable "runner_binaries_s3_logging_bucket" {
  description = "Bucket for action runner distribution bucket access logging."
  type        = string
  default     = null

  # Make sure the bucket name only contains legal characters
  validation {
    error_message = "Only lowercase alphanumeric characters and hyphens allowed in the bucket name."
    condition     = var.runner_binaries_s3_logging_bucket == null || can(regex("^[a-z0-9-]*$", var.runner_binaries_s3_logging_bucket))
  }
}

variable "runner_binaries_s3_logging_bucket_prefix" {
  description = "Bucket prefix for action runner distribution bucket access logging."
  type        = string
  default     = null

  # Make sure the bucket prefix only contains legal characters
  validation {
    error_message = "Only alphanumeric characters, hyphens followed by single slashes allowed in the bucket prefix."
    condition     = var.runner_binaries_s3_logging_bucket_prefix == null || can(regex("^(([a-zA-Z0-9-])+(\\/?))*$", var.runner_binaries_s3_logging_bucket_prefix))
  }
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

variable "runner_as_root" {
  description = "Run the action runner under the root user. Variable `runner_run_as` will be ignored."
  type        = bool
  default     = false
}

variable "runner_run_as" {
  description = "Run the GitHub actions agent as user."
  type        = string
  default     = "ec2-user"
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

variable "enable_runner_detailed_monitoring" {
  description = "Should detailed monitoring be enabled for the runner. Set this to true if you want to use detailed monitoring. See https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-cloudwatch-new.html for details."
  type        = bool
  default     = false
}

variable "enable_runner_on_demand_failover_for_errors" {
  description = "Enable on-demand failover. For example to fall back to on demand when no spot capacity is available the variable can be set to `InsufficientInstanceCapacity`. When not defined the default behavior is to retry later."
  type        = list(string)
  default     = []
}

variable "enable_userdata" {
  description = "Should the userdata script be enabled for the runner. Set this to false if you are using your own prebuilt AMI."
  type        = bool
  default     = true
}

variable "userdata_template" {
  description = "Alternative user-data template file path, replacing the default template. By providing your own user_data you have to take care of installing all required software, including the action runner. Variables userdata_pre/post_install are ignored."
  type        = string
  default     = null
}

variable "userdata_content" {
  description = "Alternative user-data content, replacing the templated one. By providing your own user_data you have to take care of installing all required software, including the action runner and registering the runner.  Be-aware configuration paramaters in SSM as well as tags are treated as internals. Changes will not trigger a breaking release."
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

variable "runner_hook_job_started" {
  type        = string
  default     = ""
  description = "Script to be ran in the runner environment at the beginning of every job"
}

variable "runner_hook_job_completed" {
  type        = string
  default     = ""
  description = "Script to be ran in the runner environment at the end of every job"
}

variable "idle_config" {
  description = "List of time periods, defined as a cron expression, to keep a minimum amount of runners active instead of scaling down to 0. By defining this list you can ensure that in time periods that match the cron expression within 5 seconds a runner is kept idle."
  type = list(object({
    cron             = string
    timeZone         = string
    idleCount        = number
    evictionStrategy = optional(string, "oldest_first")
  }))
  default = []
}

variable "enable_ssm_on_runners" {
  description = "Enable to allow access to the runner instances for debugging purposes via SSM. Note that this adds additional permissions to the runner instances."
  type        = bool
  default     = false
}

variable "logging_retention_in_days" {
  description = "Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653."
  type        = number
  default     = 180
}

variable "logging_kms_key_id" {
  description = "Specifies the kms key id to encrypt the logs with."
  type        = string
  default     = null
}

variable "block_device_mappings" {
  description = "The EC2 instance block device configuration. Takes the following keys: `device_name`, `delete_on_termination`, `volume_type`, `volume_size`, `encrypted`, `iops`, `throughput`, `kms_key_id`, `snapshot_id`."
  type = list(object({
    delete_on_termination = optional(bool, true)
    device_name           = optional(string, "/dev/xvda")
    encrypted             = optional(bool, true)
    iops                  = optional(number)
    kms_key_id            = optional(string)
    snapshot_id           = optional(string)
    throughput            = optional(number)
    volume_size           = number
    volume_type           = optional(string, "gp3")
  }))
  default = [{
    volume_size = 30
  }]
}

variable "ami" {
  description = <<EOT
AMI configuration for the action runner instances. This object allows you to specify all AMI-related settings in one place.

Parameters:
- `filter`: Map of lists to filter AMIs by various criteria (e.g., { name = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-*"], state = ["available"] })
- `owners`: List of AMI owners to limit the search. Common values: ["amazon"], ["self"], or specific AWS account IDs
- `id_ssm_parameter_name`: Name of an SSM parameter containing the AMI ID. If specified, this overrides the AMI filter
- `id_ssm_parameter_arn`: ARN of an SSM parameter containing the AMI ID. If specified, this overrides both AMI filter and parameter name
- `kms_key_arn`: Optional KMS key ARN if the AMI is encrypted with a customer managed key

Defaults to null, in which case the module falls back to individual AMI variables (deprecated).
EOT
  type = object({
    filter               = optional(map(list(string)), { state = ["available"] })
    owners               = optional(list(string), ["amazon"])
    id_ssm_parameter_arn = optional(string, null)
    kms_key_arn          = optional(string, null)
  })
  default = null
}

variable "ami_filter" {
  description = "[DEPRECATED: Use ami.filter] Map of lists used to create the AMI filter for the action runner AMI."
  type        = map(list(string))
  default     = { state = ["available"] }
  validation {
    # check the availability of the AMI
    condition     = contains(keys(var.ami_filter), "state")
    error_message = "The AMI filter must contain the state filter."
  }
}

variable "ami_owners" {
  description = "[DEPRECATED: Use ami.owners] The list of owners that should be used to find the AMI."
  type        = list(string)
  default     = ["amazon"]
}

variable "ami_id_ssm_parameter_name" {
  description = "[DEPRECATED: Use ami.id_ssm_parameter_name] String used to construct the SSM parameter name used to resolve the latest AMI ID for the runner instances. The SSM parameter should be of type String and contain a valid AMI ID. The default behavior is to use the latest Ubuntu 22.04 AMI."
  type        = string
  default     = null
}

variable "ami_kms_key_arn" {
  description = "[DEPRECATED: Use ami.kms_key_arn] Optional CMK Key ARN to be used to launch an instance from a shared encrypted AMI"
  type        = string
  default     = null
}

variable "lambda_s3_bucket" {
  description = "S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly."
  type        = string
  default     = null
}

variable "syncer_lambda_s3_key" {
  description = "S3 key for syncer lambda function. Required if using an S3 bucket to specify lambdas."
  type        = string
  default     = null
}

variable "syncer_lambda_s3_object_version" {
  description = "S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket."
  type        = string
  default     = null
}

variable "webhook_lambda_s3_key" {
  description = "S3 key for webhook lambda function. Required if using S3 bucket to specify lambdas."
  type        = string
  default     = null
}

variable "webhook_lambda_s3_object_version" {
  description = "S3 object version for webhook lambda function. Useful if S3 versioning is enabled on source bucket."
  type        = string
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

variable "runners_lambda_s3_key" {
  description = "S3 key for runners lambda function. Required if using S3 bucket to specify lambdas."
  type        = string
  default     = null
}

variable "runners_lambda_s3_object_version" {
  description = "S3 object version for runners lambda function. Useful if S3 versioning is enabled on source bucket."
  type        = string
  default     = null
}

variable "create_service_linked_role_spot" {
  description = "(optional) create the service linked role for spot instances that is required by the scale-up lambda."
  type        = bool
  default     = false
}

variable "runner_iam_role_managed_policy_arns" {
  description = "Attach AWS or customer-managed IAM policies (by ARN) to the runner IAM role"
  type        = list(string)
  default     = []
}

variable "enable_cloudwatch_agent" {
  description = "Enables the cloudwatch agent on the ec2 runner instances. The runner uses a default config that can be overridden via `cloudwatch_config`."
  type        = bool
  default     = true
}

variable "cloudwatch_config" {
  description = "(optional) Replaces the module's default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details."
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
  default = null
}

variable "ghes_url" {
  description = "GitHub Enterprise Server URL. Example: https://github.internal.co - DO NOT SET IF USING PUBLIC GITHUB. However if you are using Github Enterprise Cloud with data-residency (ghe.com), set the endpoint here. Example - https://companyname.ghe.com "
  type        = string
  default     = null
}

variable "ghes_ssl_verify" {
  description = "GitHub Enterprise SSL verification. Set to 'false' when custom certificate (chains) is used for GitHub Enterprise Server (insecure)."
  type        = bool
  default     = true
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
  description = "(optional) List of additional security groups IDs to apply to the runner."
  type        = list(string)
  default     = []
}

variable "instance_target_capacity_type" {
  description = "Default lifecycle used for runner instances, can be either `spot` or `on-demand`."
  type        = string
  default     = "spot"
  validation {
    condition     = contains(["spot", "on-demand"], var.instance_target_capacity_type)
    error_message = "The instance target capacity should be either spot or on-demand."
  }
}

variable "instance_allocation_strategy" {
  description = "The allocation strategy for spot instances. AWS recommends using `price-capacity-optimized` however the AWS default is `lowest-price`."
  type        = string
  default     = "lowest-price"
  validation {
    condition     = contains(["lowest-price", "diversified", "capacity-optimized", "capacity-optimized-prioritized", "price-capacity-optimized"], var.instance_allocation_strategy)
    error_message = "The instance allocation strategy does not match the allowed values."
  }
}

variable "instance_max_spot_price" {
  description = "Max price price for spot instances per hour. This variable will be passed to the create fleet as max spot price for the fleet."
  type        = string
  default     = null
}

variable "instance_types" {
  description = "List of instance types for the action runner. Defaults are based on runner_os (al2023 for linux and Windows Server Core for win)."
  type        = list(string)
  default     = ["m5.large", "c5.large"]
}

variable "repository_white_list" {
  description = "List of github repository full names (owner/repo_name) that will be allowed to use the github app. Leave empty for no filtering."
  type        = list(string)
  default     = []
}

variable "delay_webhook_event" {
  description = "The number of seconds the event accepted by the webhook is invisible on the queue before the scale up lambda will receive the event."
  type        = number
  default     = 30
}
variable "job_queue_retention_in_seconds" {
  description = "The number of seconds the job is held in the queue before it is purged."
  type        = number
  default     = 86400
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

variable "enable_runner_workflow_job_labels_check_all" {
  description = "If set to true all labels in the workflow job must match the GitHub labels (os, architecture and `self-hosted`). When false if __any__ label matches it will trigger the webhook."
  type        = bool
  default     = true
}

variable "matcher_config_parameter_store_tier" {
  description = "The tier of the parameter store for the matcher configuration. Valid values are `Standard`, and `Advanced`."
  type        = string
  default     = "Standard"
  validation {
    condition     = contains(["Standard", "Advanced"], var.matcher_config_parameter_store_tier)
    error_message = "`matcher_config_parameter_store_tier` value is not valid, valid values are: `Standard`, and `Advanced`."
  }
}
variable "runner_ec2_tags" {
  description = "Map of tags that will be added to the launch template instance tag specifications."
  type        = map(string)
  default     = {}
}

variable "runner_metadata_options" {
  description = "Metadata options for the ec2 runner instances. By default, the module uses metadata tags for bootstrapping the runner, only disable `instance_metadata_tags` when using custom scripts for starting the runner."
  type        = map(any)
  default = {
    instance_metadata_tags      = "enabled"
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }
}

variable "enable_ephemeral_runners" {
  description = "Enable ephemeral runners, runners will only be used once."
  type        = bool
  default     = false
}

variable "enable_job_queued_check" {
  description = "Only scale if the job event received by the scale up lambda is in the queued state. By default enabled for non ephemeral runners and disabled for ephemeral. Set this variable to overwrite the default behavior."
  type        = bool
  default     = null
}

variable "enable_managed_runner_security_group" {
  description = "Enables creation of the default managed security group. Unmanaged security groups can be specified via `runner_additional_security_group_ids`."
  type        = bool
  default     = true
}

variable "runner_os" {
  description = "The EC2 Operating System type to use for action runner instances (linux,windows)."
  type        = string
  default     = "linux"

  validation {
    condition     = contains(["linux", "windows"], var.runner_os)
    error_message = "Valid values for runner_os are (linux, windows)."
  }
}

variable "lambda_principals" {
  description = "(Optional) add extra principals to the role created for execution of the lambda, e.g. for local testing."
  type = list(object({
    type        = string
    identifiers = list(string)
  }))
  default = []
}

variable "redrive_build_queue" {
  description = "Set options to attach (optional) a dead letter queue to the build queue, the queue between the webhook and the scale up lambda. You have the following options. 1. Disable by setting `enabled` to false. 2. Enable by setting `enabled` to `true`, `maxReceiveCount` to a number of max retries."
  type = object({
    enabled         = bool
    maxReceiveCount = number
  })
  default = {
    enabled         = false
    maxReceiveCount = null
  }
  validation {
    condition     = var.redrive_build_queue.enabled && var.redrive_build_queue.maxReceiveCount != null || !var.redrive_build_queue.enabled
    error_message = "Ensure you have set the maxReceiveCount when enabled."
  }
}

variable "runner_architecture" {
  description = "The platform architecture of the runner instance_type."
  type        = string
  default     = "x64"
  validation {
    condition     = contains(["x64", "arm64"], var.runner_architecture)
    error_message = "`runner_architecture` value not valid, valid values are: `x64` and `arm64`."
  }
}

variable "pool_lambda_memory_size" {
  description = "Memory size limit for scale-up lambda."
  type        = number
  default     = 512
}

variable "pool_lambda_timeout" {
  description = "Time out for the pool lambda in seconds."
  type        = number
  default     = 60
}

variable "pool_runner_owner" {
  description = "The pool will deploy runners to the GitHub org ID, set this value to the org to which you want the runners deployed. Repo level is not supported."
  type        = string
  default     = null
}

variable "pool_lambda_reserved_concurrent_executions" {
  description = "Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations."
  type        = number
  default     = 1
}

variable "pool_config" {
  description = "The configuration for updating the pool. The `pool_size` to adjust to by the events triggered by the `schedule_expression`. For example you can configure a cron expression for weekdays to adjust the pool to 10 and another expression for the weekend to adjust the pool to 1. Use `schedule_expression_timezone` to override the schedule time zone (defaults to UTC)."
  type = list(object({
    schedule_expression          = string
    schedule_expression_timezone = optional(string)
    size                         = number
  }))
  default = []
}

variable "aws_partition" {
  description = "(optiona) partition in the arn namespace to use if not 'aws'"
  type        = string
  default     = "aws"
}

variable "disable_runner_autoupdate" {
  description = "Disable the auto update of the github runner agent. Be aware there is a grace period of 30 days, see also the [GitHub article](https://github.blog/changelog/2022-02-01-github-actions-self-hosted-runners-can-now-disable-automatic-updates/)"
  type        = bool
  default     = false
}

variable "lambda_runtime" {
  description = "AWS Lambda runtime."
  type        = string
  default     = "nodejs22.x"
}

variable "lambda_architecture" {
  description = "AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86_64' functions. "
  type        = string
  default     = "arm64"
  validation {
    condition     = contains(["arm64", "x86_64"], var.lambda_architecture)
    error_message = "`lambda_architecture` value is not valid, valid values are: `arm64` and `x86_64`."
  }
}

variable "enable_runner_binaries_syncer" {
  description = "Option to disable the lambda to sync GitHub runner distribution, useful when using a pre-build AMI."
  type        = bool
  default     = true
}

variable "state_event_rule_binaries_syncer" {
  type        = string
  description = "Option to disable EventBridge Lambda trigger for the binary syncer, useful to stop automatic updates of binary distribution"
  default     = "ENABLED"

  validation {
    condition     = contains(["ENABLED", "DISABLED", "ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS"], var.state_event_rule_binaries_syncer)
    error_message = "`state_event_rule_binaries_syncer` value is not valid, valid values are: `ENABLED`, `DISABLED`, `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS`."
  }
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

variable "enable_user_data_debug_logging_runner" {
  description = "Option to enable debug logging for user-data, this logs all secrets as well."
  type        = bool
  default     = false
}

variable "ssm_paths" {
  description = "The root path used in SSM to store configuration and secrets."
  type = object({
    root       = optional(string, "github-action-runners")
    app        = optional(string, "app")
    runners    = optional(string, "runners")
    webhook    = optional(string, "webhook")
    use_prefix = optional(bool, true)
  })
  default = {}
}

variable "runner_name_prefix" {
  description = "The prefix used for the GitHub runner name. The prefix will be used in the default start script to prefix the instance name when register the runner in GitHub. The value is availabe via an EC2 tag 'ghr:runner_name_prefix'."
  type        = string
  default     = ""
  validation {
    condition     = length(var.runner_name_prefix) <= 45
    error_message = "The prefix used for the GitHub runner name must be less than 32 characters. AWS instances id are 17 chars, https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/resource-ids.html"
  }
}

variable "tracing_config" {
  description = "Configuration for lambda tracing."
  type = object({
    mode                  = optional(string, null)
    capture_http_requests = optional(bool, false)
    capture_error         = optional(bool, false)
  })
  default = {}
}

variable "runner_credit_specification" {
  description = "The credit option for CPU usage of a T instance. Can be unset, \"standard\" or \"unlimited\"."
  type        = string
  default     = null

  validation {
    condition     = var.runner_credit_specification == null ? true : contains(["standard", "unlimited"], var.runner_credit_specification)
    error_message = "Valid values for runner_credit_specification are (null, \"standard\", \"unlimited\")."
  }
}

variable "enable_jit_config" {
  description = "Overwrite the default behavior for JIT configuration. By default JIT configuration is enabled for ephemeral runners and disabled for non-ephemeral runners. In case of GHES check first if the JIT config API is avaialbe. In case you upgradeing from 3.x to 4.x you can set `enable_jit_config` to `false` to avoid a breaking change when having your own AMI."
  type        = bool
  default     = null
}

variable "associate_public_ipv4_address" {
  description = "Associate public IPv4 with the runner. Only tested with IPv4"
  type        = bool
  default     = false
}

variable "runners_ssm_housekeeper" {
  description = <<EOF
  Configuration for the SSM housekeeper lambda. This lambda deletes token / JIT config from SSM.

  `schedule_expression`: is used to configure the schedule for the lambda.
  `enabled`: enable or disable the lambda trigger via the EventBridge.
  `lambda_memory_size`: lambda memery size limit.
  `lambda_timeout`: timeout for the lambda in seconds.
  `config`: configuration for the lambda function. Token path will be read by default from the module.
  EOF
  type = object({
    schedule_expression = optional(string, "rate(1 day)")
    enabled             = optional(bool, true)
    lambda_memory_size  = optional(number, 512)
    lambda_timeout      = optional(number, 60)
    config = object({
      tokenPath      = optional(string)
      minimumDaysOld = optional(number, 1)
      dryRun         = optional(bool, false)
    })
  })
  default = { config = {} }
}

variable "metrics" {
  description = "Configuration for metrics created by the module, by default disabled to avoid additional costs. When metrics are enable all metrics are created unless explicit configured otherwise."
  type = object({
    enable    = optional(bool, false)
    namespace = optional(string, "GitHub Runners")
    metric = optional(object({
      enable_github_app_rate_limit    = optional(bool, true)
      enable_job_retry                = optional(bool, true)
      enable_spot_termination_warning = optional(bool, true)
    }), {})
  })
  default = {}
}

variable "instance_termination_watcher" {
  description = <<-EOF
    Configuration for the instance termination watcher. This feature is Beta, changes will not trigger a major release as long in beta.

    `enable`: Enable or disable the spot termination watcher.
    'features': Enable or disable features of the termination watcher.
    `memory_size`: Memory size linit in MB of the lambda.
    `s3_key`: S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas.
    `s3_object_version`: S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket.
    `timeout`: Time out of the lambda in seconds.
    `zip`: File location of the lambda zip file.
  EOF

  type = object({
    enable = optional(bool, false)
    features = optional(object({
      enable_spot_termination_handler              = optional(bool, true)
      enable_spot_termination_notification_watcher = optional(bool, true)
    }), {})
    memory_size       = optional(number, null)
    s3_key            = optional(string, null)
    s3_object_version = optional(string, null)
    timeout           = optional(number, null)
    zip               = optional(string, null)
  })
  default = {}

}

variable "runners_ebs_optimized" {
  description = "Enable EBS optimization for the runner instances."
  type        = bool
  default     = false
}

variable "lambda_tags" {
  description = "Map of tags that will be added to all the lambda function resources. Note these are additional tags to the default tags."
  type        = map(string)
  default     = {}
}

variable "job_retry" {
  description = <<-EOF
    Experimental! Can be removed / changed without trigger a major release.Configure job retries. The configuration enables job retries (for ephemeral runners). After creating the insances a message will be published to a job retry queue. The job retry check lambda is checking after a delay if the job is queued. If not the message will be published again on the scale-up (build queue). Using this feature can impact the reate limit of the GitHub app.

    `enable`: Enable or disable the job retry feature.
    `delay_in_seconds`: The delay in seconds before the job retry check lambda will check the job status.
    `delay_backoff`: The backoff factor for the delay.
    `lambda_memory_size`: Memory size limit in MB for the job retry check lambda.
    `lambda_timeout`: Time out of the job retry check lambda in seconds.
    `max_attempts`: The maximum number of attempts to retry the job.
  EOF

  type = object({
    enable             = optional(bool, false)
    delay_in_seconds   = optional(number, 300)
    delay_backoff      = optional(number, 2)
    lambda_memory_size = optional(number, 256)
    lambda_timeout     = optional(number, 30)
    max_attempts       = optional(number, 1)
  })
  default = {}
}

variable "eventbridge" {
  description = <<EOF
    Enable the use of EventBridge by the module. By enabling this feature events will be put on the EventBridge by the webhook instead of directly dispatching to queues for scaling.

    `enable`: Enable the EventBridge feature.
    `accept_events`: List can be used to only allow specific events to be putted on the EventBridge. By default all events, empty list will be be interpreted as all events.
EOF
  type = object({
    enable        = optional(bool, true)
    accept_events = optional(list(string), null)
  })

  default = {}
}

variable "user_agent" {
  description = "User agent used for API calls by lambda functions."
  type        = string
  default     = "github-aws-runners"
}
