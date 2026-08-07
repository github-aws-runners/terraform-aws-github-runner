variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name."
  type        = map(string)
  default     = {}
}

variable "prefix" {
  description = "The prefix used for naming resources"
  type        = string
  default     = "github-actions"
}

variable "runner_os" {
  description = "Operating system used for runner labels and provider bootstrap (linux, osx, windows)."
  type        = string
  default     = "linux"

  validation {
    condition     = contains(["linux", "osx", "windows"], var.runner_os)
    error_message = "Valid values for runner_os are (linux, osx, windows)."
  }
}

variable "sqs_build_queue" {
  description = "SQS queue to consume accepted build events."
  type = object({
    arn = string
    url = string
  })
}

variable "enable_organization_runners" {
  description = "Register runners to organization, instead of repo level"
  type        = bool
}

variable "github_app_parameters" {
  description = "Parameter Store for GitHub App Parameters."
  type = object({
    key_base64 = map(string)
    id         = map(string)
  })
}

variable "lambda_scale_down_memory_size" {
  description = "Memory size limit in MB for scale down lambda."
  type        = number
  default     = 512
}

variable "scale_down_schedule_expression" {
  description = "Scheduler expression to check every x for scale down."
  type        = string
  default     = "cron(*/5 * * * ? *)"
}

variable "minimum_running_time_in_minutes" {
  description = "Minimum time a runner should remain active before it can be terminated while idle. If unset, the default is calculated from runner_os."
  type        = number
  default     = null
}

variable "runner_boot_time_in_minutes" {
  description = "Minimum time for a compute runner to boot and register."
  type        = number
  default     = 5
}

variable "runner_disable_default_labels" {
  description = "Disable default labels for the runners (os, architecture and `self-hosted`). If enabled, the runner will only have the extra labels provided in `runner_extra_labels`."
  type        = bool
  default     = false
}

variable "runner_labels" {
  description = "All the labels for the runners (GitHub) including the default one's(e.g: self-hosted, linux, x64, label1, label2). Separate each label by a comma"
  type        = list(string)
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

variable "lambda_scale_up_memory_size" {
  description = "Memory size limit in MB for scale-up lambda."
  type        = number
  default     = 512
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
  description = "The maximum number of runners that will be created. Setting the variable to `-1` desiables the maximum check."
  type        = number
  default     = 3
}

variable "runner_architecture" {
  description = "Platform architecture used for runner labels and provider bootstrap."
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

variable "log_class" {
  description = "The log class of the CloudWatch log groups for the lambda functions. Valid values are `STANDARD` or `INFREQUENT_ACCESS`."
  type        = string
  default     = "STANDARD"

  validation {
    condition     = contains(["STANDARD", "INFREQUENT_ACCESS"], var.log_class)
    error_message = "`log_class` must be either `STANDARD` or `INFREQUENT_ACCESS`."
  }
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

variable "aws_partition" {
  description = "(optional) partition for the base arn if not 'aws'"
  type        = string
  default     = "aws"
}

variable "ghes_url" {
  description = "GitHub Enterprise Server URL. DO NOT SET IF USING PUBLIC GITHUB..However if you are using GitHub Enterprise Cloud with data-residency (ghe.com), set the endpoint here. Example - https://companyname.ghe.com|"
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

variable "kms_key_arn" {
  description = "Optional CMK Key ARN to be used for Parameter Store."
  type        = string
  default     = null
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

variable "pool_lambda_memory_size" {
  description = "Lambda Memory size limit in MB for pool lambda"
  type        = number
  default     = 512
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
  description = "The configuration for updating the pool. The `pool_size` to adjust to by the events triggered by the `schedule_expression`. For example you can configure a cron expression for week days to adjust the pool to 10 and another expression for the weekend to adjust the pool to 1. Use `schedule_expression_timezone ` to override the schedule time zone (defaults to UTC)."
  type = list(object({
    schedule_expression          = string
    schedule_expression_timezone = optional(string)
    size                         = number
  }))
  default = []
}

variable "pool_include_busy_runners" {
  description = "Include busy runners in the pool calculation. By default busy runners are not included in the pool."
  type        = bool
  default     = false
}

variable "disable_runner_autoupdate" {
  description = "Disable the auto update of the github runner agent. Be aware there is a grace period of 30 days, see also the [GitHub article](https://github.blog/changelog/2022-02-01-github-actions-self-hosted-runners-can-now-disable-automatic-updates/)"
  type        = bool
  default     = false
}

variable "lambda_runtime" {
  description = "AWS Lambda runtime."
  type        = string
  default     = "nodejs24.x"
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
variable "ssm_paths" {
  description = "The root path used in SSM to store configuration and secrets."
  type = object({
    root   = string
    tokens = string
    config = string
  })
}

variable "runner_name_prefix" {
  description = "The prefix used for the GitHub runner name. The prefix will be used in the default start script to prefix the instance name when register the runner in GitHub. The value is available via an EC2 tag 'ghr:runner_name_prefix'."
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


variable "enable_jit_config" {
  description = "Overwrite the default behavior for JIT configuration. By default JIT configuration is enabled for ephemeral runners and disabled for non-ephemeral runners. In case of GHES check first if the JIT config API is available. In case you are upgrading from 3.x to 4.x you can set `enable_jit_config` to `false` to avoid a breaking change when having your own AMI."
  type        = bool
  default     = null
}

variable "ssm_housekeeper" {
  description = <<EOF
  Configuration for the SSM housekeeper lambda. This lambda deletes token / JIT config from SSM.

  `schedule_expression`: is used to configure the schedule for the lambda.
  `state`: state of the cloudwatch event rule. Valid values are `DISABLED`, `ENABLED`, and `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS`.
  `lambda_memory_size`: lambda memory size limit.
  `lambda_timeout`: timeout for the lambda in seconds.
  `config`: configuration for the lambda function. Token path will be read by default from the module.
  EOF
  type = object({
    schedule_expression = optional(string, "rate(1 day)")
    state               = optional(string, "ENABLED")
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

variable "lambda_tags" {
  description = "Map of tags that will be added to all the lambda function resources. Note these are additional tags to the default tags."
  type        = map(string)
  default     = {}
}

variable "metrics" {
  description = "Configuration for metrics created by the module, by default metrics are disabled to avoid additional costs. When metrics are enable all metrics are created unless explicit configured otherwise."
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

variable "job_retry" {
  description = <<-EOF
    Configure job retries. The configuration enables job retries (for ephemeral runners). After creating the instances a message will be published to a job retry queue. The job retry check lambda is checking after a delay if the job is queued. If not the message will be published again on the scale-up (build queue). Using this feature can impact the rate limit of the GitHub app.

    `enable`: Enable or disable the job retry feature.
    `delay_in_seconds`: The delay in seconds before the job retry check lambda will check the job status.
    `delay_backoff`: The backoff factor for the delay.
    `lambda_memory_size`: Memory size limit in MB for the job retry check lambda.
    'lambda_reserved_concurrent_executions': Amount of reserved concurrent executions for the job retry check lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations.
    `lambda_timeout`: Time out of the job retry check lambda in seconds.
    `max_attempts`: The maximum number of attempts to retry the job.
  EOF

  type = object({
    enable                                = optional(bool, false)
    delay_in_seconds                      = optional(number, 300)
    delay_backoff                         = optional(number, 2)
    lambda_memory_size                    = optional(number, 256)
    lambda_reserved_concurrent_executions = optional(number, 1)

    lambda_timeout = optional(number, 30)

    max_attempts = optional(number, 1)
  })
  default = {}

  validation {
    condition     = var.job_retry.enable == false || (var.job_retry.enable == true && var.job_retry.delay_in_seconds <= 900)
    error_message = "The maximum message delay for SWS is 900 seconds."
  }
}

variable "user_agent" {
  description = "User agent used for API calls."
  type        = string
  default     = null
}

variable "lambda_event_source_mapping_batch_size" {
  description = "Maximum number of records to pass to the lambda function in a single batch for the event source mapping. When not set, the AWS default of 10 events will be used."
  type        = number
  default     = 10
  validation {
    condition     = var.lambda_event_source_mapping_batch_size >= 1 && var.lambda_event_source_mapping_batch_size <= 1000
    error_message = "The batch size for the lambda event source mapping must be between 1 and 1000."
  }
}

variable "lambda_event_source_mapping_maximum_batching_window_in_seconds" {
  description = "Maximum amount of time to gather records before invoking the lambda function, in seconds. AWS requires this to be greater than 0 if batch_size is greater than 10. Defaults to 0."
  type        = number
  default     = 0
  validation {
    condition     = var.lambda_event_source_mapping_maximum_batching_window_in_seconds >= 0 && var.lambda_event_source_mapping_maximum_batching_window_in_seconds <= 300
    error_message = "Maximum batching window must be between 0 and 300 seconds."
  }
}

variable "parameter_store_tags" {
  description = "Map of tags that will be added to all the SSM Parameter Store parameters created by the Lambda function."
  type        = map(string)
  default     = {}
}
