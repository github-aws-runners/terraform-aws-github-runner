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
        http_tokens                 = "optional"
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
      enable_ephemeral_runners                = optional(bool, false)
      enable_job_queued_check                 = optional(bool, null)
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
      runner_extra_labels                     = string
      runner_group_name                       = optional(string, "Default")
      runner_name_prefix                      = optional(string, "")
      runner_run_as                           = optional(string, "ec2-user")
      runners_maximum_count                   = number
      runner_additional_security_group_ids    = optional(list(string), [])
      scale_down_schedule_expression          = optional(string, "cron(*/5 * * * ? *)")
      scale_up_reserved_concurrent_executions = optional(number, 1)
      userdata_template                       = optional(string, null)
      enable_jit_config                       = optional(bool, null)
      enable_runner_detailed_monitoring       = optional(bool, false)
      enable_cloudwatch_agent                 = optional(bool, true)
      userdata_pre_install                    = optional(string, "")
      userdata_post_install                   = optional(string, "")
      runner_ec2_tags                         = optional(map(string), {})
      runner_iam_role_managed_policy_arns     = optional(list(string), [])
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
      pool_config = optional(list(object({
        schedule_expression = string
        size                = number
      })), [])
    })

    matcherConfig = object({
      labelMatchers = list(list(string))
      exactMatch    = optional(bool, false)
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
        enable_ephemeral_runners: "Enable ephemeral runners, runners will only be used once."
        enable_job_queued_check: "Enables JIT configuration for creating runners instead of registration token based registraton. JIT configuration will only be applied for ephemeral runners. By default JIT confiugration is enabled for ephemeral runners an can be disabled via this override. When running on GHES without support for JIT configuration this variable should be set to true for ephemeral runners."
        enable_organization_runners: "Register runners to organization, instead of repo level"
        enable_runner_binaries_syncer: "Option to disable the lambda to sync GitHub runner distribution, useful when using a pre-build AMI."
        enable_ssm_on_runners: "Enable to allow access the runner instances for debugging purposes via SSM. Note that this adds additional permissions to the runner instances."
        enable_userdata: "Should the userdata script be enabled for the runner. Set this to false if you are using your own prebuilt AMI."
        instance_allocation_strategy: "The allocation strategy for spot instances. AWS recommends to use `capacity-optimized` however the AWS default is `lowest-price`."
        instance_max_spot_price: "Max price price for spot intances per hour. This variable will be passed to the create fleet as max spot price for the fleet."
        instance_target_capacity_type: "Default lifecycle used for runner instances, can be either `spot` or `on-demand`."
        instance_types: "List of instance types for the action runner. Defaults are based on runner_os (amzn2 for linux and Windows Server Core for win)."
        job_queue_retention_in_seconds: "The number of seconds the job is held in the queue before it is purged"
        minimum_running_time_in_minutes: "The time an ec2 action runner should be running at minimum before terminated if not busy."
        pool_runner_owner: "The pool will deploy runners to the GitHub org ID, set this value to the org to which you want the runners deployed. Repo level is not supported."
        runner_additional_security_group_ids: "List of additional security groups IDs to apply to the runner. If added outside the multi_runner_config block, the additional security group(s) will be applied to all runner configs. If added inside the multi_runner_config, the additional security group(s) will be applied to the individual runner."
        runner_as_root: "Run the action runner under the root user. Variable `runner_run_as` will be ignored."
        runner_boot_time_in_minutes: "The minimum time for an EC2 runner to boot and register as a runner."
        runner_extra_labels: "Extra (custom) labels for the runners (GitHub). Separate each label by a comma. Labels checks on the webhook can be enforced by setting `enable_workflow_job_labels_check`. GitHub read-only labels should not be provided."
        runner_group_name: "Name of the runner group."
        runner_name_prefix: "Prefix for the GitHub runner name."
        runner_run_as: "Run the GitHub actions agent as user."
        runners_maximum_count: "The maximum number of runners that will be created."
        scale_down_schedule_expression: "Scheduler expression to check every x for scale down."
        scale_up_reserved_concurrent_executions: "Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations."
        userdata_template: "Alternative user-data template, replacing the default template. By providing your own user_data you have to take care of installing all required software, including the action runner. Variables userdata_pre/post_install are ignored."
        enable_jit_config "Overwrite the default behavior for JIT configuration. By default JIT configuration is enabled for ephemeral runners and disabled for non-ephemeral runners. In case of GHES check first if the JIT config API is avaialbe. In case you upgradeing from 3.x to 4.x you can set `enable_jit_config` to `false` to avoid a breaking change when having your own AMI."
        enable_runner_detailed_monitoring: "Should detailed monitoring be enabled for the runner. Set this to true if you want to use detailed monitoring. See https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-cloudwatch-new.html for details."
        enable_cloudwatch_agent: "Enabling the cloudwatch agent on the ec2 runner instances, the runner contains default config. Configuration can be overridden via `cloudwatch_config`."
        userdata_pre_install: "Script to be ran before the GitHub Actions runner is installed on the EC2 instances"
        userdata_post_install: "Script to be ran after the GitHub Actions runner is installed on the EC2 instances"
        runner_ec2_tags: "Map of tags that will be added to the launch template instance tag specifications."
        runner_iam_role_managed_policy_arns: "Attach AWS or customer-managed IAM policies (by ARN) to the runner IAM role"
        idle_config: "List of time period that can be defined as cron expression to keep a minimum amount of runners active instead of scaling down to 0. By defining this list you can ensure that in time periods that match the cron expression within 5 seconds a runner is kept idle."
        runner_log_files: "(optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details."
        block_device_mappings: "The EC2 instance block device configuration. Takes the following keys: `device_name`, `delete_on_termination`, `volume_type`, `volume_size`, `encrypted`, `iops`, `throughput`, `kms_key_id`, `snapshot_id`."
        pool_config: "The configuration for updating the pool. The `pool_size` to adjust to by the events triggered by the `schedule_expression`. For example you can configure a cron expression for week days to adjust the pool to 10 and another expression for the weekend to adjust the pool to 1."
      }
      matcherConfig: {
        labelMatchers: "The list of list of labels supported by the runner configuration. `[[self-hosted, linux, x64, example]]`"
        exactMatch: "If set to true all labels in the workflow job must match the GitHub labels (os, architecture and `self-hosted`). When false if __any__ workflow label matches it will trigger the webhook."
      }
      fifo: "Enable a FIFO queue to remain the order of events received by the webhook. Suggest to set to true for repo level runners."
      redrive_build_queue: "Set options to attach (optional) a dead letter queue to the build queue, the queue between the webhook and the scale up lambda. You have the following options. 1. Disable by setting `enabled` to false. 2. Enable by setting `enabled` to `true`, `maxReceiveCount` to a number of max retries."
    }
  EOT
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

variable "enable_event_rule_binaries_syncer" {
  type        = bool
  default     = true
  description = "Option to disable EventBridge Lambda trigger for the binary syncer, useful to stop automatic updates of binary distribution"
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
  })
  default = {}
}

variable "lambda_tracing_mode" {
  description = "Enable X-Ray tracing for the lambda functions."
  type        = string
  default     = null
}
