variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "vpc_id" {
  description = "The VPC for the security groups."
  type        = string
}

variable "subnet_ids" {
  description = "List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`."
  type        = list(string)
}

variable "overrides" {
  description = "This map provides the possibility to override some defaults. The following attributes are supported: `name_sg` overrides the `Name` tag for all security groups created by this module. `name_runner_agent_instance` overrides the `Name` tag for the ec2 instance defined in the auto launch configuration. `name_docker_machine_runners` overrides the `Name` tag spot instances created by the runner agent."
  type        = map(string)

  default = {
    name_runner = ""
    name_sg     = ""
  }
}

variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name."
  type        = map(string)
  default     = {}
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

variable "s3_runner_binaries" {
  description = "Bucket details for cached GitHub binary."
  type = object({
    arn = string
    id  = string
    key = string
  })
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

variable "instance_target_capacity_type" {
  description = "Default lifecyle used runner instances, can be either `spot` or `on-demand`."
  type        = string
  default     = "spot"

  validation {
    condition     = contains(["spot", "on-demand"], var.instance_target_capacity_type)
    error_message = "The instance target capacity should be either spot or on-demand."
  }
}

variable "instance_allocation_strategy" {
  description = "The allocation strategy for spot instances. AWS recommends to use `capacity-optimized` however the AWS default is `lowest-price`."
  type        = string
  default     = "lowest-price"

  validation {
    condition     = contains(["lowest-price", "diversified", "capacity-optimized", "capacity-optimized-prioritized", "price-capacity-optimized"], var.instance_allocation_strategy)
    error_message = "The instance allocation strategy does not match the allowed values."
  }
}

variable "instance_max_spot_price" {
  description = "Max price price for spot intances per hour. This variable will be passed to the create fleet as max spot price for the fleet."
  type        = string
  default     = null
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

variable "instance_type" { # tflint-ignore: terraform_unused_declarations
  description = "[DEPRECATED] See instance_types."
  type        = string
  default     = "m5.large"
}

variable "instance_types" {
  description = "List of instance types for the action runner. Defaults are based on runner_os (amzn2 for linux and Windows Server Core for win)."
  type        = list(string)
  default     = null
}

variable "ami_filter" {
  description = "Map of lists used to create the AMI filter for the action runner AMI."
  type        = map(list(string))
  default     = { state = ["available"] }
  validation {
    // check the availability of the AMI
    condition     = contains(keys(var.ami_filter), "state")
    error_message = "The \"ami_filter\" variable must contain the \"state\" key with the value \"available\"."
  }
}

variable "ami_owners" {
  description = "The list of owners used to select the AMI of action runner instances."
  type        = list(string)
  default     = ["amazon"]
}

variable "ami_id_ssm_parameter_name" {
  description = "Externally managed SSM parameter (of data type aws:ec2:image) that contains the AMI ID to launch runner instances from. Overrides ami_filter"
  type        = string
  default     = null
}

variable "ami_kms_key_arn" {
  description = "Optional CMK Key ARN to be used to launch an instance from a shared encrypted AMI"
  type        = string
  default     = null
}

variable "enable_userdata" {
  description = "Should the userdata script be enabled for the runner. Set this to false if you are using your own prebuilt AMI"
  type        = bool
  default     = true
}

variable "userdata_template" {
  description = "Alternative user-data template, replacing the default template. By providing your own user_data you have to take care of installing all required software, including the action runner. Variables userdata_pre/post_install are ignored."
  type        = string
  default     = null
}

variable "userdata_pre_install" {
  description = "User-data script snippet to insert before GitHub action runner install"
  type        = string
  default     = ""
}

variable "userdata_post_install" {
  description = "User-data script snippet to insert after GitHub action runner install"
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

variable "github_app_parameters" {
  description = "Parameter Store for GitHub App Parameters."
  type = object({
    key_base64 = map(string)
    id         = map(string)
  })
}

variable "scale_down_schedule_expression" {
  description = "Scheduler expression to check every x for scale down."
  type        = string
  default     = "cron(*/5 * * * ? *)"
}

variable "minimum_running_time_in_minutes" {
  description = "The time an ec2 action runner should be running at minimum before terminated if non busy. If not set the default is calculated based on the OS."
  type        = number
  default     = null
}

variable "runner_boot_time_in_minutes" {
  description = "The minimum time for an EC2 runner to boot and register as a runner."
  type        = number
  default     = 5
}

variable "runner_labels" {
  description = "All the labels for the runners (GitHub) including the default one's(e.g: self-hosted, linux, x64, label1, label2). Separate each label by a comma"
  type        = string
}

variable "runner_group_name" {
  description = "Name of the runner group."
  type        = string
  default     = "Default"
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

variable "scale_up_reserved_concurrent_executions" {
  description = "Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations."
  type        = number
  default     = 1
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
  description = "The path that will be added to the role; if not set, the prefix will be used."
  type        = string
  default     = null
}

variable "instance_profile_path" {
  description = "The path that will be added to the instance_profile, if not set the prefix will be used."
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

variable "runner_architecture" {
  description = "The platform architecture of the runner instance_type."
  type        = string
  default     = "x64"
}

variable "idle_config" {
  description = "List of time period that can be defined as cron expression to keep a minimum amount of runners active instead of scaling down to 0. By defining this list you can ensure that in time periods that match the cron expression within 5 seconds a runner is kept idle."
  type = list(object({
    cron             = string
    timeZone         = string
    idleCount        = number
    evictionStrategy = optional(string, "oldest_first")
  }))
  default = []
}

variable "logging_retention_in_days" {
  description = "Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653."
  type        = number
  default     = 180
}

variable "logging_kms_key_id" {
  description = "Specifies the kms key id to encrypt the logs with"
  type        = string
  default     = null
}

variable "enable_ssm_on_runners" {
  description = "Enable to allow access to the runner instances for debugging purposes via SSM. Note that this adds additional permissions to the runner instances."
  type        = bool
}

variable "lambda_s3_bucket" {
  description = "S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly."
  type        = string
  default     = null
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

variable "aws_partition" {
  description = "(optional) partition for the base arn if not 'aws'"
  type        = string
  default     = "aws"
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

variable "enable_managed_runner_security_group" {
  description = "Enabling the default managed security group creation. Unmanaged security groups can be specified via `runner_additional_security_group_ids`."
  type        = bool
  default     = true
}

variable "cloudwatch_config" {
  description = "(optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details."
  type        = string
  default     = null
}

variable "runner_log_files" {
  description = "(optional) List of logfiles to send to CloudWatch, will only be used if `enable_cloudwatch_agent` is set to true. Object description: `log_group_name`: Name of the log group, `prefix_log_group`: If true, the log group name will be prefixed with `/github-self-hosted-runners/<var.prefix>`, `file_path`: path to the log file, `log_stream_name`: name of the log stream."
  type = list(object({
    log_group_name   = string
    prefix_log_group = bool
    file_path        = string
    log_stream_name  = string
  }))
  default = null
}

variable "ghes_url" {
  description = "GitHub Enterprise Server URL. DO NOT SET IF USING PUBLIC GITHUB"
  type        = string
  default     = null
}

variable "ghes_ssl_verify" {
  description = "GitHub Enterprise SSL verification. Set to 'false' when custom certificate (chains) is used for GitHub Enterprise Server (insecure)."
  type        = bool
  default     = true
}

variable "lambda_subnet_ids" {
  description = "List of subnets in which the lambda will be launched, the subnets needs to be subnets in the `vpc_id`."
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

variable "kms_key_arn" {
  description = "Optional CMK Key ARN to be used for Parameter Store."
  type        = string
  default     = null
}

variable "enable_runner_detailed_monitoring" {
  description = "Enable detailed monitoring for runners"
  type        = bool
  default     = false
}

variable "egress_rules" {
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

variable "log_type" {
  description = "Logging format for lambda logging. Valid values are 'json', 'pretty', 'hidden'. "
  type        = string
  default     = null
  validation {
    condition     = var.log_type == null
    error_message = "DEPRECATED: `log_type` is not longer supported."
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

variable "runner_ec2_tags" {
  description = "Map of tags that will be added to the launch template instance tag specifications."
  type        = map(string)
  default     = {}
}

variable "metadata_options" {
  description = "Metadata options for the ec2 runner instances. By default, the module uses metadata tags for bootstrapping the runner, only disable `instance_metadata_tags` when using custom scripts for starting the runner."
  type        = map(any)
  default = {
    instance_metadata_tags      = "enabled"
    http_endpoint               = "enabled"
    http_tokens                 = "optional"
    http_put_response_hop_limit = 1
  }
}

variable "enable_ephemeral_runners" {
  description = "Enable ephemeral runners, runners will only be used once."
  type        = bool
  default     = false
}

variable "enable_job_queued_check" {
  description = "Only scale if the job event received by the scale up lambda is is in the state queued. By default enabled for non ephemeral runners and disabled for ephemeral. Set this variable to overwrite the default behavior."
  type        = bool
  default     = null
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
  description = "The configuration for updating the pool. The `pool_size` to adjust to by the events triggered by the `schedule_expression`. For example you can configure a cron expression for week days to adjust the pool to 10 and another expression for the weekend to adjust the pool to 1."
  type = list(object({
    schedule_expression = string
    size                = number
  }))
  default = []
}

variable "disable_runner_autoupdate" {
  description = "Disable the auto update of the github runner agent. Be aware there is a grace period of 30 days, see also the [GitHub article](https://github.blog/changelog/2022-02-01-github-actions-self-hosted-runners-can-now-disable-automatic-updates/)"
  type        = bool
  default     = false
}

variable "lambda_runtime" {
  description = "AWS Lambda runtime."
  type        = string
  default     = "nodejs18.x"
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

variable "enable_user_data_debug_logging" {
  description = "Option to enable debug logging for user-data, this logs all secrets as well."
  type        = bool
  default     = false
}

variable "ssm_paths" {
  description = "The root path used in SSM to store configuration and secreets."
  type = object({
    root   = string
    tokens = string
    config = string
  })
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

variable "lambda_tracing_mode" {
  description = "Enable X-Ray tracing for the lambda functions."
  type        = string
  default     = null
}

variable "credit_specification" {
  description = "The credit option for CPU usage of a T instance. Can be unset, \"standard\" or \"unlimited\"."
  type        = string
  default     = null

  validation {
    condition     = var.credit_specification == null ? true : contains(["standard", "unlimited"], var.credit_specification)
    error_message = "Valid values for credit_specification are (null, \"standard\", \"unlimited\")."
  }
}

variable "enable_jit_config" {
  description = "Overwrite the default behavior for JIT configuration. By default JIT configuration is enabled for ephemeral runners and disabled for non-ephemeral runners. In case of GHES check first if the JIT config API is avaialbe. In case you upgradeing from 3.x to 4.x you can set `enable_jit_config` to `false` to avoid a breaking change when having your own AMI."
  type        = bool
  default     = null
}
