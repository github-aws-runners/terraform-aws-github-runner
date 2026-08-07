variable "multi_runner_config_v2" {
  description = <<EOT
Experimental runner lane configuration keyed by lane name. This v2 shape uses the same canonical ownership groups as runner-stack. The schema can change while the provider model is being finalized. V1 and v2 maps can be used together when their lane keys do not overlap.

Each lane has:
- `runner`: runner identity, registration, runtime, and IAM configuration.
- `github`: GitHub registration scope for the lane.
- `scale_up`, `scale_down`, `pool`, and `job_retry`: control-plane behavior.
- `compute_provider`: backend discriminator plus typed provider configuration.
- `queue`: queue and event-source settings for the lane.
- `matcherConfig`: webhook routing labels and priority.
EOT

  type = map(object({
    runner = object({
      os                     = string
      architecture           = string
      boot_time_in_minutes   = optional(number, 5)
      disable_default_labels = optional(bool, false)
      extra_labels           = optional(list(string), [])
      group_name             = optional(string, "Default")
      name_prefix            = optional(string, "")
      run_as_root            = optional(bool, false)
      run_as                 = optional(string, "ec2-user")
      maximum_count          = number
      ephemeral              = optional(bool, false)
      jit_config_enabled     = optional(bool, null)
      auto_update_disabled   = optional(bool, false)
      hooks = optional(object({
        job_started   = optional(string, "")
        job_completed = optional(string, "")
      }), {})
      iam = optional(object({
        role = optional(object({
          arn = string
        }), null)
        managed_policy_arns  = optional(map(string), {})
        path                 = optional(string, null)
        permissions_boundary = optional(string, null)
      }), {})
    })

    github = optional(object({
      organization_runners = optional(bool, false)
    }), {})

    queue = optional(object({
      delay_webhook_event            = optional(number, 30)
      job_queue_retention_in_seconds = optional(number, 86400)
      event_source_mapping = optional(object({
        batch_size                         = optional(number, null)
        maximum_batching_window_in_seconds = optional(number, null)
      }), {})
      redrive_build_queue = optional(object({
        enabled         = bool
        maxReceiveCount = number
        }), {
        enabled         = false
        maxReceiveCount = null
      })
    }), {})

    scale_up = optional(object({
      reserved_concurrent_executions = optional(number, 1)
      job_queued_check_enabled       = optional(bool, null)
    }), {})

    scale_down = optional(object({
      schedule_expression             = optional(string, "cron(*/5 * * * ? *)")
      minimum_running_time_in_minutes = optional(number, null)
      idle_config = optional(list(object({
        cron             = string
        timeZone         = string
        idleCount        = number
        evictionStrategy = optional(string, "oldest_first")
      })), [])
    }), {})

    pool = optional(object({
      config = optional(list(object({
        schedule_expression          = string
        schedule_expression_timezone = optional(string)
        size                         = number
      })), [])
      runner_owner = optional(string, null)
    }), {})

    job_retry = optional(object({
      enabled          = optional(bool, false)
      delay_in_seconds = optional(number, 300)
      delay_backoff    = optional(number, 2)
      max_attempts     = optional(number, 1)
      lambda = optional(object({
        memory_size                    = optional(number, 256)
        reserved_concurrent_executions = optional(number, 1)
        timeout                        = optional(number, 30)
      }), {})
    }), {})

    compute_provider = object({
      type = string

      ec2 = optional(object({
        metadata_options = optional(object({
          instance_metadata_tags      = optional(string, "enabled")
          http_endpoint               = optional(string, "enabled")
          http_tokens                 = optional(string, "required")
          http_put_response_hop_limit = optional(number, 1)
        }), {})
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
        create_service_linked_role_spot = optional(bool, false)
        credit_specification            = optional(string, null)
        ebs_optimized                   = optional(bool, false)
        cloudwatch_agent = optional(object({
          enabled = optional(bool, true)
          config  = optional(string, null)
        }), {})
        binaries_syncer = optional(object({
          enabled = optional(bool, true)
        }), {})
        detailed_monitoring_enabled = optional(bool, false)
        ssm_enabled                 = optional(bool, false)
        user_data = optional(object({
          enabled               = optional(bool, true)
          template              = optional(string, null)
          content               = optional(string, null)
          pre_install           = optional(string, "")
          post_install          = optional(string, "")
          debug_logging_enabled = optional(bool, false)
        }), {})
        instance_allocation_strategy  = optional(string, "lowest-price")
        instance_max_spot_price       = optional(string, null)
        instance_target_capacity_type = optional(string, "spot")
        instance_type_priorities      = optional(map(number), null)
        instance_types                = list(string)
        additional_security_group_ids = optional(list(string), [])
        instance_profile = optional(object({
          name = string
        }), null)
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
        log_files = optional(list(object({
          log_group_name   = string
          prefix_log_group = bool
          file_path        = string
          log_stream_name  = string
          log_class        = optional(string, "STANDARD")
        })), null)
        tags = optional(map(string), {})
      }), null)

      # Future provider references only. Do not uncomment until the Terraform
      # resources for these lanes are implemented.
      #
      # microvm = optional(object({
      #   environment_variables = optional(map(string), {})
      # }), null)
    })

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
      lower(trimspace(lane.compute_provider.type)) == "ec2"
    ])
    error_message = "compute_provider.type must be ec2. microvm and codebuild are reserved for future Terraform support."
  }

  validation {
    condition = alltrue([
      for _, lane in var.multi_runner_config_v2 :
      lane.compute_provider.ec2 != null
    ])
    error_message = "Each lane must set compute_provider.ec2."
  }

  validation {
    condition = alltrue([
      for _, lane in var.multi_runner_config_v2 :
      lane.compute_provider.ec2 == null ? true : (
        lane.compute_provider.ec2.instance_profile == null || lane.runner.iam.role != null
      )
    ])
    error_message = "runner.iam.role must be set when compute_provider.ec2.instance_profile selects an external instance profile."
  }

  validation {
    condition = alltrue([
      for _, lane in var.multi_runner_config_v2 :
      lane.runner.iam.role == null || length(lane.runner.iam.managed_policy_arns) == 0
    ])
    error_message = "runner.iam.managed_policy_arns cannot be set with an external runner.iam.role because external roles are not managed by this module."
  }
}
