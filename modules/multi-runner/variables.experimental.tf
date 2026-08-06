variable "multi_runner_config_v2" {
  description = <<EOT
Experimental runner lane configuration keyed by lane name. This v2 shape separates common runner routing from provider-specific backend configuration. The schema can change while the provider model is being finalized. When set, this variable takes precedence over stable `multi_runner_config`.

Each lane has:
- `runner`: GitHub runner behavior shared by all providers.
- `provider`: backend discriminator plus typed provider configuration.
- `queue`: queue and event-source settings for the lane.
- `matcherConfig`: webhook routing labels and priority.
EOT
  type = map(object({
    runner = object({
      runner_os                   = string
      runner_architecture         = string
      disable_runner_autoupdate   = optional(bool, false)
      enable_ephemeral_runners    = optional(bool, false)
      enable_job_queued_check     = optional(bool, null)
      enable_jit_config           = optional(bool, null)
      enable_organization_runners = optional(bool, false)
      idle_config = optional(list(object({
        cron             = string
        timeZone         = string
        idleCount        = number
        evictionStrategy = optional(string, "oldest_first")
      })), [])
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
    })

    provider = object({
      type = string

      ec2 = optional(object({
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
        runner_iam_role_managed_policy_arns  = optional(list(string), [])
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
      }), null)

      # Future provider references only. Do not uncomment until the Terraform
      # resources for these lanes are implemented.
      #
      # microvm = optional(object({
      #   environment_variables = optional(map(string), {})
      # }), null)
    })

    queue = optional(object({
      delay_webhook_event                                            = optional(number, 30)
      job_queue_retention_in_seconds                                 = optional(number, 86400)
      lambda_event_source_mapping_batch_size                         = optional(number, null)
      lambda_event_source_mapping_maximum_batching_window_in_seconds = optional(number, null)
      redrive_build_queue = optional(object({
        enabled         = bool
        maxReceiveCount = number
        }), {
        enabled         = false
        maxReceiveCount = null
      })
    }), {})

    matcherConfig = object({
      labelMatchers           = list(list(string))
      exactMatch              = optional(bool, false)
      bidirectionalLabelMatch = optional(bool, false)
      priority                = optional(number, 999)
      enableDynamicLabels     = optional(bool, false)
      awsDynamicLabelsPolicy  = optional(any, null)
    })
  }))
  default = {}

  validation {
    condition = alltrue([
      for _, lane in var.multi_runner_config_v2 :
      lower(trimspace(lane.provider.type)) == "ec2"
    ])
    error_message = "provider.type must be ec2. microvm and codebuild are reserved for future Terraform support."
  }

  validation {
    condition = alltrue([
      for _, lane in var.multi_runner_config_v2 :
      lane.provider.ec2 != null
    ])
    error_message = "Each lane must set provider.ec2."
  }
}
