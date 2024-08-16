variable "github_app" {
  description = "GitHub app parameters, see your github app. Ensure the key is the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`)."
  type = object({
    key_base64     = string
    id             = string
    webhook_secret = string
  })
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

variable "multi_runner_config" {
  type = map(object({
    runner_config = object({
      runner_os           = string
      runner_architecture = string
      runner_metadata_options = optional(map(any), {
        instance_metadata_tags      = "enabled"
        http_endpoint               = "enabled"
        http_tokens                 = "required"
        http_put_response_hop_limit = 1
      })
      ami_filter                              = optional(map(list(string)), { state = ["available"] })
      ami_owners                              = optional(list(string), ["amazon"])
      ami_id_ssm_parameter_name               = optional(string, null)
      ami_kms_key_arn                         = optional(string, "")
      create_service_linked_role_spot         = optional(bool, false)
      credit_specification                    = optional(string, null)
      delay_webhook_event                     = optional(number, 30)
      disable_runner_autoupdate               = optional(bool, false)
      ebs_optimized                           = optional(bool, false)
      enable_ephemeral_runners                = optional(bool, false)
      enable_job_queued_check                 = optional(bool, null)
      enable_on_demand_failover_for_errors    = optional(list(string), [])
      enable_organization_runners             = optional(bool, false)
      enable_runner_binaries_syncer           = optional(bool, true)
      enable_ssm_on_runners                   = optional(bool, false)
      enable_userdata                         = optional(bool, true)
      instance_allocation_strategy            = optional(string, "lowest-price")
      instance_max_spot_price                 = optional(string, null)
      instance_target_capacity_type           = optional(string, "spot")
      instance_types                          = list(string)
      job_queue_retention_in_seconds          = optional(number, 86400)
      minimum_running_time_in_minutes         = optional(number, null)
      pool_runner_owner                       = optional(string, null)
      runner_as_root                          = optional(bool, false)
      runner_boot_time_in_minutes             = optional(number, 5)
      runner_extra_labels                     = optional(list(string), [])
      runner_group_name                       = optional(string, "Default")
      runner_name_prefix                      = optional(string, "")
      runner_run_as                           = optional(string, "ec2-user")
      runners_maximum_count                   = number
      runner_additional_security_group_ids    = optional(list(string), [])
      scale_down_schedule_expression          = optional(string, "cron(*/5 * * * ? *)")
      scale_up_reserved_concurrent_executions = optional(number, 1)
      userdata_template                       = optional(string, null)
      userdata_content                        = optional(string, null)
      enable_jit_config                       = optional(bool, null)
      enable_runner_detailed_monitoring       = optional(bool, false)
      enable_cloudwatch_agent                 = optional(bool, true)
      cloudwatch_config                       = optional(string, null)
      userdata_pre_install                    = optional(string, "")
      userdata_post_install                   = optional(string, "")
      runner_ec2_tags                         = optional(map(string), {})
      runner_iam_role_managed_policy_arns     = optional(list(string), [])
      vpc_id                                  = optional(string, null)
      subnet_ids                              = optional(list(string), null)
      idle_config = optional(list(object({
        cron             = string
        timeZone         = string
        idleCount        = number
        evictionStrategy = optional(string, "oldest_first")
      })), [])
      runner_log_files = optional(list(object({
        log_group_name   = string
        prefix_log_group = bool
        file_path        = string
        log_stream_name  = string
      })), null)
      block_device_mappings = optional(list(object({
        delete_on_termination = optional(bool, true)
        device_name           = optional(string, "/dev/xvda")
        encrypted             = optional(bool, true)
        iops                  = optional(number)
        kms_key_id            = optional(string)
        snapshot_id           = optional(string)
        throughput            = optional(number)
        volume_size           = number
        volume_type           = optional(string, "gp3")
        })), [{
        volume_size = 30
      }])
      pool_config = optional(list(object({
        schedule_expression          = string
        schedule_expression_timezone = optional(string)
        size                         = number
      })), [])
      job_retry = optional(object({
        enable             = optional(bool, false)
        delay_in_seconds   = optional(number, 300)
        delay_backoff      = optional(number, 2)
        lambda_memory_size = optional(number, 256)
        lambda_timeout     = optional(number, 30)
        max_attempts       = optional(number, 1)
      }), {})
    })
    matcherConfig = object({
      labelMatchers = list(list(string))
      exactMatch    = optional(bool, false)
      priority      = optional(number, 999)
    })
    fifo = optional(bool, false)
    redrive_build_queue = optional(object({
      enabled         = bool
      maxReceiveCount = number
      }), {
      enabled         = false
      maxReceiveCount = null
    })
  }))
  description = <<EOT
    multi_runner_config = {
      runner_config: {
        runner_os: "The EC2 Operating System type to use for action runner instances (linux,windows)."
        runner_architecture: "The platform architecture of the runner instance_type."
        runner_metadata_options: "(Optional) Metadata options for the ec2 runner instances."
        ami_filter: "(Optional) List of maps used to create the AMI filter for the action runner AMI. By default amazon linux 2 is used."
        ami_owners: "(Optional) The list of owners used to select the AMI of action runner instances."
        create_service_linked_role_spot: (Optional) create the serviced linked role for spot instances that is required by the scale-up lambda.
        credit_specification: "(Optional) The credit specification of the runner instance_type. Can be unset, `standard` or `unlimited`.
        delay_webhook_event: "The number of seconds the event accepted by the webhook is invisible on the queue before the scale up lambda will receive the event."
        disable_runner_autoupdate: "Disable the auto update of the github runner agent. Be aware there is a grace period of 30 days, see also the [GitHub article](https://github.blog/changelog/2022-02-01-github-actions-self-hosted-runners-can-now-disable-automatic-updates/)"
        ebs_optimized: "The EC2 EBS optimized configuration."
        enable_ephemeral_runners: "Enable ephemeral runners, runners will only be used once."
        enable_job_queued_check: "Enables JIT configuration for creating runners instead of registration token based registraton. JIT configuration will only be applied for ephemeral runners. By default JIT confiugration is enabled for ephemeral runners an can be disabled via this override. When running on GHES without support for JIT configuration this variable should be set to true for ephemeral runners."
        enable_on_demand_failover_for_errors: "Enable on-demand failover. For example to fall back to on demand when no spot capacity is available the variable can be set to `InsufficientInstanceCapacity`. When not defined the default behavior is to retry later."
        enable_organization_runners: "Register runners to organization, instead of repo level"
        enable_runner_binaries_syncer: "Option to disable the lambda to sync GitHub runner distribution, useful when using a pre-build AMI."
        enable_ssm_on_runners: "Enable to allow access the runner instances for debugging purposes via SSM. Note that this adds additional permissions to the runner instances."
        enable_userdata: "Should the userdata script be enabled for the runner. Set this to false if you are using your own prebuilt AMI."
        instance_allocation_strategy: "The allocation strategy for spot instances. AWS recommends to use `capacity-optimized` however the AWS default is `lowest-price`."
        instance_max_spot_price: "Max price price for spot intances per hour. This variable will be passed to the create fleet as max spot price for the fleet."
        instance_target_capacity_type: "Default lifecycle used for runner instances, can be either `spot` or `on-demand`."
        instance_types: "List of instance types for the action runner. Defaults are based on runner_os (al2023 for linux and Windows Server Core for win)."
        job_queue_retention_in_seconds: "The number of seconds the job is held in the queue before it is purged"
        minimum_running_time_in_minutes: "The time an ec2 action runner should be running at minimum before terminated if not busy."
        pool_runner_owner: "The pool will deploy runners to the GitHub org ID, set this value to the org to which you want the runners deployed. Repo level is not supported."
        runner_additional_security_group_ids: "List of additional security groups IDs to apply to the runner. If added outside the multi_runner_config block, the additional security group(s) will be applied to all runner configs. If added inside the multi_runner_config, the additional security group(s) will be applied to the individual runner."
        runner_as_root: "Run the action runner under the root user. Variable `runner_run_as` will be ignored."
        runner_boot_time_in_minutes: "The minimum time for an EC2 runner to boot and register as a runner."
        runner_extra_labels: "Extra (custom) labels for the runners (GitHub). Separate each label by a comma. Labels checks on the webhook can be enforced by setting `multi_runner_config.matcherConfig.exactMatch`. GitHub read-only labels should not be provided."
        runner_group_name: "Name of the runner group."
        runner_name_prefix: "Prefix for the GitHub runner name."
        runner_run_as: "Run the GitHub actions agent as user."
        runners_maximum_count: "The maximum number of runners that will be created. Setting the variable to `-1` desiables the maximum check."
        scale_down_schedule_expression: "Scheduler expression to check every x for scale down."
        scale_up_reserved_concurrent_executions: "Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations."
        userdata_template: "Alternative user-data template, replacing the default template. By providing your own user_data you have to take care of installing all required software, including the action runner. Variables userdata_pre/post_install are ignored."
        enable_jit_config "Overwrite the default behavior for JIT configuration. By default JIT configuration is enabled for ephemeral runners and disabled for non-ephemeral runners. In case of GHES check first if the JIT config API is avaialbe. In case you upgradeing from 3.x to 4.x you can set `enable_jit_config` to `false` to avoid a breaking change when having your own AMI."
        enable_runner_detailed_monitoring: "Should detailed monitoring be enabled for the runner. Set this to true if you want to use detailed monitoring. See https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-cloudwatch-new.html for details."
        enable_cloudwatch_agent: "Enabling the cloudwatch agent on the ec2 runner instances, the runner contains default config. Configuration can be overridden via `cloudwatch_config`."
        cloudwatch_config: "(optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details."
        userdata_pre_install: "Script to be ran before the GitHub Actions runner is installed on the EC2 instances"
        userdata_post_install: "Script to be ran after the GitHub Actions runner is installed on the EC2 instances"
        runner_ec2_tags: "Map of tags that will be added to the launch template instance tag specifications."
        runner_iam_role_managed_policy_arns: "Attach AWS or customer-managed IAM policies (by ARN) to the runner IAM role"
        vpc_id: "The VPC for security groups of the action runners. If not set uses the value of `var.vpc_id`."
        subnet_ids: "List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`. If not set, uses the value of `var.subnet_ids`."
        idle_config: "List of time period that can be defined as cron expression to keep a minimum amount of runners active instead of scaling down to 0. By defining this list you can ensure that in time periods that match the cron expression within 5 seconds a runner is kept idle."
        runner_log_files: "(optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details."
        block_device_mappings: "The EC2 instance block device configuration. Takes the following keys: `device_name`, `delete_on_termination`, `volume_type`, `volume_size`, `encrypted`, `iops`, `throughput`, `kms_key_id`, `snapshot_id`."
        job_retry: "Experimental! Can be removed / changed without trigger a major release. Configure job retries. The configuration enables job retries (for ephemeral runners). After creating the insances a message will be published to a job retry queue. The job retry check lambda is checking after a delay if the job is queued. If not the message will be published again on the scale-up (build queue). Using this feature can impact the reate limit of the GitHub app."
        pool_config: "The configuration for updating the pool. The `pool_size` to adjust to by the events triggered by the `schedule_expression`. For example you can configure a cron expression for week days to adjust the pool to 10 and another expression for the weekend to adjust the pool to 1. Use `schedule_expression_timezone` to override the schedule time zone (defaults to UTC)."
      }
      matcherConfig: {
        labelMatchers: "The list of list of labels supported by the runner configuration. `[[self-hosted, linux, x64, example]]`"
        exactMatch: "If set to true all labels in the workflow job must match the GitHub labels (os, architecture and `self-hosted`). When false if __any__ workflow label matches it will trigger the webhook."
        priority: "If set it defines the priority of the matcher, the matcher with the lowest priority will be evaluated first. Default is 999, allowed values 0-999."
      }
      fifo: "Enable a FIFO queue to remain the order of events received by the webhook. Suggest to set to true for repo level runners."
      redrive_build_queue: "Set options to attach (optional) a dead letter queue to the build queue, the queue between the webhook and the scale up lambda. You have the following options. 1. Disable by setting `enabled` to false. 2. Enable by setting `enabled` to `true`, `maxReceiveCount` to a number of max retries."
    }
  EOT
}

variable "scale_up_lambda_memory_size" {
  description = "Memory size limit in MB for scale_up lambda."
  type        = number
  default     = 512
}

variable "runners_scale_up_lambda_timeout" {
  description = "Time out for the scale up lambda in seconds."
  type        = number
  default     = 30
}

variable "scale_down_lambda_memory_size" {
  description = "Memory size limit in MB for scale down."
  type        = number
  default     = 512
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

variable "webhook_lambda_memory_size" {
  description = "Memory size limit in MB for webhook lambda."
  type        = number
  default     = 256
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
  default     = 180
}

variable "logging_kms_key_id" {
  description = "Specifies the kms key id to encrypt the logs with"
  type        = string
  default     = null
}

variable "lambda_s3_bucket" {
  description = "S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly."
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

variable "repository_white_list" {
  description = "List of github repository full names (owner/repo_name) that will be allowed to use the github app. Leave empty for no filtering."
  type        = list(string)
  default     = []
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
  default     = "nodejs20.x"
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

variable "syncer_lambda_s3_key" {
  description = "S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas."
  type        = string
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

variable "runner_binaries_syncer_memory_size" {
  description = "Memory size limit in MB for binary syncer lambda."
  type        = number
  default     = 256
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
  type        = string
  default     = null
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
  type        = string
  default     = null
}

variable "runners_lambda_s3_object_version" {
  description = "S3 object version for runners lambda function. Useful if S3 versioning is enabled on source bucket."
  type        = string
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

variable "key_name" {
  description = "Key pair name"
  type        = string
  default     = null
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

variable "enable_workflow_job_events_queue" {
  description = "Enabling this experimental feature will create a secondory sqs queue to wich a copy of the workflow_job event will be delivered."
  type        = bool
  default     = false
}

variable "workflow_job_queue_configuration" {
  description = "Configuration options for workflow job queue which is only applicable if the flag enable_workflow_job_events_queue is set to true."
  type = object({
    delay_seconds              = number
    visibility_timeout_seconds = number
    message_retention_seconds  = number
  })
  default = {
    "delay_seconds" : null,
    "visibility_timeout_seconds" : null,
    "message_retention_seconds" : null
  }
}

variable "ssm_paths" {
  description = "The root path used in SSM to store configuration and secreets."
  type = object({
    root    = optional(string, "github-action-runners")
    app     = optional(string, "app")
    runners = optional(string, "runners")
    webhook = optional(string, "webhook")
  })
  default = {}
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

variable "metrics_namespace" {
  description = "The namespace for the metrics created by the module. Merics will only be created if explicit enabled."
  type        = string
  default     = "GitHub Runners"
}

variable "instance_termination_watcher" {
  description = <<-EOF
    Configuration for the spot termination watcher lambda function. This feature is Beta, changes will not trigger a major release as long in beta.

    `enable`: Enable or disable the spot termination watcher.
    'enable_metrics': Enable metric for the lambda. If `spot_warning` is set to true, the lambda will emit a metric when it detects a spot termination warning.
    `memory_size`: Memory size linit in MB of the lambda.
    `s3_key`: S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas.
    `s3_object_version`: S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket.
    `timeout`: Time out of the lambda in seconds.
    `zip`: File location of the lambda zip file.
  EOF

  type = object({
    enable = optional(bool, false)
    enable_metric = optional(object({
      spot_warning = optional(bool, false)
    }))
    memory_size       = optional(number, null)
    s3_key            = optional(string, null)
    s3_object_version = optional(string, null)
    timeout           = optional(number, null)
    zip               = optional(string, null)
  })
  default = {}
}

variable "lambda_tags" {
  description = "Map of tags that will be added to all the lambda function resources. Note these are additional tags to the default tags."
  type        = map(string)
  default     = {}
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

variable "enable_metrics_control_plane" {
  description = "(Experimental) Enable or disable the metrics for the module. Feature can change or renamed without a major release."
  type        = bool
  default     = false
}
