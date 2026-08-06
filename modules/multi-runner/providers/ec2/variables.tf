variable "lanes" {
  description = "Resolved EC2 runner lanes keyed by the stable multi-runner lane name."
  type = map(object({
    runner = object({
      runner_os                               = string
      runner_architecture                     = string
      disable_runner_autoupdate               = optional(bool, false)
      enable_ephemeral_runners                = optional(bool, false)
      enable_job_queued_check                 = optional(bool, null)
      enable_jit_config                       = optional(bool, null)
      enable_organization_runners             = optional(bool, false)
      minimum_running_time_in_minutes         = optional(number, null)
      pool_runner_owner                       = optional(string, null)
      runner_as_root                          = optional(bool, false)
      runner_boot_time_in_minutes             = optional(number, 5)
      runner_disable_default_labels           = optional(bool, false)
      runner_extra_labels                     = optional(list(string), [])
      runner_group_name                       = optional(string, "Default")
      runner_name_prefix                      = optional(string, "")
      runner_run_as                           = optional(string, "ec2-user")
      runners_maximum_count                   = number
      runner_iam_role_managed_policy_arns     = optional(list(string), [])
      scale_down_schedule_expression          = optional(string, "cron(*/5 * * * ? *)")
      scale_up_reserved_concurrent_executions = optional(number, 1)
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
      iam_overrides = optional(object({
        override_instance_profile = optional(bool, null)
        instance_profile_name     = optional(string, null)
        override_runner_role      = optional(bool, null)
        runner_role_arn           = optional(string, null)
        }), {
        override_instance_profile = false
        instance_profile_name     = null
        override_runner_role      = false
        runner_role_arn           = null
      })
    })

    provider = object({
      runner_metadata_options = optional(map(any), {
        instance_metadata_tags      = "enabled"
        http_endpoint               = "enabled"
        http_tokens                 = "required"
        http_put_response_hop_limit = 1
      })
      ami = optional(object({
        filter               = optional(map(list(string)), { state = ["available"] })
        owners               = optional(list(string), ["amazon"])
        id_ssm_parameter_arn = optional(string, null)
        kms_key_arn          = optional(string, null)
      }), null)
      block_device_mappings = optional(list(object({
        delete_on_termination      = optional(bool, true)
        device_name                = optional(string, "/dev/xvda")
        encrypted                  = optional(bool, true)
        iops                       = optional(number)
        kms_key_id                 = optional(string)
        snapshot_id                = optional(string)
        throughput                 = optional(number)
        volume_initialization_rate = optional(number)
        volume_size                = number
        volume_type                = optional(string, "gp3")
        })), [{
        volume_size = 30
      }])
      cloudwatch_config                    = optional(string, null)
      create_service_linked_role_spot      = optional(bool, false)
      credit_specification                 = optional(string, null)
      ebs_optimized                        = optional(bool, false)
      enable_cloudwatch_agent              = optional(bool, true)
      enable_runner_binaries_syncer        = optional(bool, true)
      enable_runner_detailed_monitoring    = optional(bool, false)
      enable_ssm_on_runners                = optional(bool, false)
      enable_userdata                      = optional(bool, true)
      instance_allocation_strategy         = optional(string, "lowest-price")
      instance_max_spot_price              = optional(string, null)
      instance_target_capacity_type        = optional(string, "spot")
      instance_type_priorities             = optional(map(number), null)
      instance_types                       = list(string)
      runner_additional_security_group_ids = optional(list(string), [])
      enable_on_demand_failover_for_errors = optional(list(string), [])
      scale_errors = optional(list(string), [
        "UnfulfillableCapacity",
        "MaxSpotInstanceCountExceeded",
        "TargetCapacityLimitExceededException",
        "RequestLimitExceeded",
        "ResourceLimitExceeded",
        "MaxSpotInstanceCountExceeded",
        "MaxSpotFleetRequestCountExceeded",
        "InsufficientInstanceCapacity",
        "InsufficientCapacityOnHost",
      ])
      subnet_ids = optional(list(string), null)
      vpc_id     = optional(string, null)
      idle_config = optional(list(object({
        cron             = string
        timeZone         = string
        idleCount        = number
        evictionStrategy = optional(string, "oldest_first")
      })), [])
      cpu_options = optional(object({
        core_count            = optional(number)
        threads_per_core      = optional(number)
        amd_sev_snp           = optional(string)
        nested_virtualization = optional(string)
      }), null)
      placement = optional(object({
        affinity                = optional(string)
        availability_zone       = optional(string)
        group_id                = optional(string)
        group_name              = optional(string)
        host_id                 = optional(string)
        host_resource_group_arn = optional(string)
        spread_domain           = optional(string)
        tenancy                 = optional(string)
        partition_number        = optional(number)
      }), null)
      license_specifications = optional(list(object({
        license_configuration_arn = string
      })), [])
      use_dedicated_host = optional(bool, false)
      runner_log_files = optional(list(object({
        log_group_name   = string
        prefix_log_group = bool
        file_path        = string
        log_stream_name  = string
        log_class        = optional(string, "STANDARD")
      })), null)
      runner_ec2_tags           = optional(map(string), {})
      runner_hook_job_completed = optional(string, "")
      runner_hook_job_started   = optional(string, "")
      userdata_content          = optional(string, null)
      userdata_post_install     = optional(string, "")
      userdata_pre_install      = optional(string, "")
      userdata_template         = optional(string, null)
    })

    queue = object({
      arn                                                            = string
      url                                                            = string
      lambda_event_source_mapping_batch_size                         = optional(number, null)
      lambda_event_source_mapping_maximum_batching_window_in_seconds = optional(number, null)
    })
  }))
}

variable "aws_region" {
  description = "AWS region for EC2 runner resources."
  type        = string
}

variable "aws_partition" {
  description = "AWS partition used in resource ARNs."
  type        = string
  default     = "aws"
}

variable "vpc_id" {
  description = "Default VPC for EC2 runner resources."
  type        = string
}

variable "subnet_ids" {
  description = "Default subnet IDs for EC2 runner resources."
  type        = list(string)
}

variable "prefix" {
  description = "Prefix used for EC2 lane resource names."
  type        = string
}

variable "tags" {
  description = "Tags shared by all EC2 lane resources."
  type        = map(string)
  default     = {}
}

variable "runner_binaries" {
  description = "Runner binary artifacts keyed by operating system and architecture."
  type = map(object({
    arn = string
    id  = string
    key = string
  }))
  default = {}
}

variable "github_app_parameters" {
  description = "SSM parameter references for the GitHub App credentials."
  type = object({
    key_base64 = map(string)
    id         = map(string)
  })
}

variable "ssm_root_path" {
  description = "Shared SSM root path beneath which EC2 lane paths are created."
  type        = string
}

variable "ssm_paths" {
  description = "Shared SSM path names used by EC2 runner lanes."
  type = object({
    runners = string
  })
}

variable "enable_managed_runner_security_group" {
  description = "Whether to create the managed security group for EC2 runners."
  type        = bool
  default     = true
}

variable "runner_egress_rules" {
  description = "Egress rules for the managed EC2 runner security group."
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
  description = "Default additional security group IDs for EC2 runners."
  type        = list(string)
  default     = []
}

variable "associate_public_ipv4_address" {
  description = "Whether EC2 runners receive a public IPv4 address."
  type        = bool
  default     = false
}

variable "key_name" {
  description = "EC2 key pair name for runner instances."
  type        = string
  default     = null
}

variable "lambda_s3_bucket" {
  description = "S3 bucket containing the runner Lambda package."
  type        = string
  default     = null
}

variable "runners_lambda_s3_key" {
  description = "S3 key for the runner Lambda package."
  type        = string
  default     = null
}

variable "runners_lambda_s3_object_version" {
  description = "S3 object version for the runner Lambda package."
  type        = string
  default     = null
}

variable "runners_lambda_zip" {
  description = "Local path to the runner Lambda package."
  type        = string
  default     = null
}

variable "lambda_runtime" {
  description = "Runtime used by EC2 control-plane Lambda functions."
  type        = string
  default     = "nodejs24.x"
}

variable "lambda_architecture" {
  description = "Architecture used by EC2 control-plane Lambda functions."
  type        = string
  default     = "arm64"
}

variable "scale_up_lambda_memory_size" {
  description = "Memory size for the EC2 scale-up Lambda function."
  type        = number
  default     = 512
}

variable "runners_scale_up_lambda_timeout" {
  description = "Timeout for the EC2 scale-up Lambda function."
  type        = number
  default     = 30
}

variable "scale_down_lambda_memory_size" {
  description = "Memory size for the EC2 scale-down Lambda function."
  type        = number
  default     = 512
}

variable "runners_scale_down_lambda_timeout" {
  description = "Timeout for the EC2 scale-down Lambda function."
  type        = number
  default     = 60
}

variable "lambda_event_source_mapping_batch_size" {
  description = "Default SQS event-source batch size for EC2 scale-up Lambdas."
  type        = number
  default     = 10
}

variable "lambda_event_source_mapping_maximum_batching_window_in_seconds" {
  description = "Default SQS event-source batching window for EC2 scale-up Lambdas."
  type        = number
  default     = 0
}

variable "lambda_subnet_ids" {
  description = "Subnet IDs for EC2 control-plane Lambda functions."
  type        = list(string)
  default     = []
}

variable "lambda_security_group_ids" {
  description = "Security group IDs for EC2 control-plane Lambda functions."
  type        = list(string)
  default     = []
}

variable "lambda_tags" {
  description = "Additional tags for EC2 control-plane Lambda functions."
  type        = map(string)
  default     = {}
}

variable "tracing_config" {
  description = "Tracing configuration for EC2 control-plane Lambda functions."
  type = object({
    mode                  = optional(string, null)
    capture_http_requests = optional(bool, false)
    capture_error         = optional(bool, false)
  })
  default = {}
}

variable "logging_retention_in_days" {
  description = "CloudWatch log retention for EC2 runner control-plane functions."
  type        = number
  default     = 180
}

variable "logging_kms_key_id" {
  description = "KMS key ID used to encrypt EC2 runner CloudWatch log groups."
  type        = string
  default     = null
}

variable "log_class" {
  description = "CloudWatch log class for EC2 runner log groups."
  type        = string
  default     = "STANDARD"
}

variable "log_level" {
  description = "Log level for EC2 runner control-plane Lambda functions."
  type        = string
  default     = "info"
}

variable "cloudwatch_config" {
  description = "Default CloudWatch agent configuration for EC2 runners."
  type        = string
  default     = null
}

variable "parameter_store_tags" {
  description = "Tags for EC2 lane SSM parameters."
  type        = map(string)
  default     = {}
}

variable "instance_profile_path" {
  description = "IAM path for EC2 runner instance profiles."
  type        = string
  default     = null
}

variable "role_path" {
  description = "IAM path for EC2 runner roles."
  type        = string
  default     = null
}

variable "role_permissions_boundary" {
  description = "Permissions boundary for EC2 runner IAM roles."
  type        = string
  default     = null
}

variable "kms_key_arn" {
  description = "KMS key ARN used for EC2 lane Parameter Store values."
  type        = string
  default     = null
}

variable "ghes_url" {
  description = "GitHub Enterprise Server URL used by EC2 runner control-plane functions."
  type        = string
  default     = null
}

variable "ghes_ssl_verify" {
  description = "Whether EC2 runner control-plane functions verify GHES TLS certificates."
  type        = bool
  default     = true
}

variable "user_agent" {
  description = "User agent used by EC2 runner control-plane GitHub API calls."
  type        = string
  default     = "github-aws-runners"
}

variable "pool_lambda_timeout" {
  description = "Timeout for EC2 pool Lambda functions."
  type        = number
  default     = 60
}

variable "pool_lambda_reserved_concurrent_executions" {
  description = "Reserved concurrency for EC2 pool Lambda functions."
  type        = number
  default     = 1
}

variable "runners_ssm_housekeeper" {
  description = "Configuration for the EC2 runner token and JIT-config SSM housekeeper."
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
  description = "Metrics configuration for EC2 runner control-plane functions."
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
