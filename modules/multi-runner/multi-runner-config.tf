locals {
  # Stable v1 remains an external flat contract. Normalize it once so common
  # multi-runner consumers can use the same ownership model as experimental v2.
  multi_runner_config_v1_as_v2 = {
    for k, v in var.multi_runner_config : k => {
      tags = {}

      runner = {
        os                     = v.runner_config.runner_os
        architecture           = v.runner_config.runner_architecture
        boot_time_in_minutes   = v.runner_config.runner_boot_time_in_minutes
        disable_default_labels = v.runner_config.runner_disable_default_labels
        extra_labels           = v.runner_config.runner_extra_labels
        group_name             = v.runner_config.runner_group_name
        name_prefix            = v.runner_config.runner_name_prefix
        run_as_root            = v.runner_config.runner_as_root
        run_as                 = v.runner_config.runner_run_as
        maximum_count          = v.runner_config.runners_maximum_count
        ephemeral              = v.runner_config.enable_ephemeral_runners
        jit_config_enabled     = v.runner_config.enable_jit_config
        auto_update_disabled   = v.runner_config.disable_runner_autoupdate
        tags                   = {}
        hooks = {
          job_started   = v.runner_config.runner_hook_job_started
          job_completed = v.runner_config.runner_hook_job_completed
        }
        iam = {
          role = v.runner_config.iam_overrides.override_runner_role == true ? {
            arn = v.runner_config.iam_overrides.runner_role_arn
          } : null
          managed_policy_arns = {
            for policy_index, policy_arn in v.runner_config.runner_iam_role_managed_policy_arns :
            "legacy-${policy_index}" => policy_arn
          }
          path                 = var.role_path
          permissions_boundary = var.role_permissions_boundary
        }
      }

      github = {
        organization_runners = v.runner_config.enable_organization_runners
      }

      lambda = {
        tags = {}
      }

      queue = {
        delay_webhook_event            = v.runner_config.delay_webhook_event
        job_queue_retention_in_seconds = v.runner_config.job_queue_retention_in_seconds
        event_source_mapping = {
          batch_size                         = v.runner_config.lambda_event_source_mapping_batch_size
          maximum_batching_window_in_seconds = v.runner_config.lambda_event_source_mapping_maximum_batching_window_in_seconds
        }
        redrive_build_queue = v.redrive_build_queue
        tags                = {}
      }

      scale_up = {
        reserved_concurrent_executions = v.runner_config.scale_up_reserved_concurrent_executions
        job_queued_check_enabled       = v.runner_config.enable_job_queued_check
        tags                           = {}
      }

      scale_down = {
        schedule_expression             = v.runner_config.scale_down_schedule_expression
        minimum_running_time_in_minutes = v.runner_config.minimum_running_time_in_minutes
        idle_config                     = v.runner_config.idle_config
        tags                            = {}
      }

      pool = {
        config       = v.runner_config.pool_config
        runner_owner = v.runner_config.pool_runner_owner
        tags         = {}
      }

      job_retry = {
        enabled          = v.runner_config.job_retry.enable
        delay_in_seconds = v.runner_config.job_retry.delay_in_seconds
        delay_backoff    = v.runner_config.job_retry.delay_backoff
        max_attempts     = v.runner_config.job_retry.max_attempts
        tags             = {}
        lambda = {
          memory_size                    = v.runner_config.job_retry.lambda_memory_size
          timeout                        = v.runner_config.job_retry.lambda_timeout
          reserved_concurrent_executions = 1
        }
      }

      ssm = {
        tags    = {}
        kms_key = null
        parameters = {
          tags = {}
        }
        housekeeper = {
          tags = {}
        }
      }

      observability = {
        logs = {
          tags = {}
        }
      }

      compute_provider = {
        type = "ec2"
        ec2 = {
          metadata_options = v.runner_config.runner_metadata_options
          # Stable v1 keeps its nullable `id_ssm_parameter_arn` leaf. Translate
          # it once into v2's caller-known ownership wrapper without changing
          # the input passed to the legacy runners module.
          ami = v.runner_config.ami == null ? null : {
            filter = v.runner_config.ami.filter
            owners = v.runner_config.ami.owners
            id_ssm_parameter = v.runner_config.ami.id_ssm_parameter_arn == null ? null : {
              arn = v.runner_config.ami.id_ssm_parameter_arn
            }
            kms_key = v.runner_config.ami.kms_key_arn == null ? null : {
              arn = v.runner_config.ami.kms_key_arn
            }
          }
          block_device_mappings           = v.runner_config.block_device_mappings
          create_service_linked_role_spot = v.runner_config.create_service_linked_role_spot
          credit_specification            = v.runner_config.credit_specification
          ebs_optimized                   = v.runner_config.ebs_optimized
          cloudwatch_agent = {
            enabled = v.runner_config.enable_cloudwatch_agent
            config  = v.runner_config.cloudwatch_config
          }
          binaries_syncer = {
            enabled = v.runner_config.enable_runner_binaries_syncer
          }
          detailed_monitoring_enabled = v.runner_config.enable_runner_detailed_monitoring
          ssm_enabled                 = v.runner_config.enable_ssm_on_runners
          user_data = {
            enabled               = v.runner_config.enable_userdata
            template              = v.runner_config.userdata_template
            content               = v.runner_config.userdata_content
            pre_install           = v.runner_config.userdata_pre_install
            post_install          = v.runner_config.userdata_post_install
            debug_logging_enabled = false
          }
          instance_allocation_strategy  = v.runner_config.instance_allocation_strategy
          instance_max_spot_price       = v.runner_config.instance_max_spot_price
          instance_target_capacity_type = v.runner_config.instance_target_capacity_type
          instance_type_priorities      = v.runner_config.instance_type_priorities
          instance_types                = v.runner_config.instance_types
          additional_security_group_ids = v.runner_config.runner_additional_security_group_ids
          instance_profile = v.runner_config.iam_overrides.override_instance_profile == true ? {
            name = v.runner_config.iam_overrides.instance_profile_name
          } : null
          enable_on_demand_failover_for_errors = v.runner_config.enable_on_demand_failover_for_errors
          scale_errors                         = v.runner_config.scale_errors
          subnet_ids                           = v.runner_config.subnet_ids
          vpc_id                               = v.runner_config.vpc_id
          cpu_options                          = v.runner_config.cpu_options
          placement                            = v.runner_config.placement
          license_specifications               = v.runner_config.license_specifications
          use_dedicated_host                   = v.runner_config.use_dedicated_host
          log_files                            = v.runner_config.runner_log_files
          tags                                 = v.runner_config.runner_ec2_tags
        }
      }

      matcherConfig = v.matcherConfig
    }
  }

  duplicate_runner_config_keys = setintersection(
    toset(keys(var.multi_runner_config)),
    toset(keys(var.experimental.multi_runner_config_v2)),
  )

  # Phase 1 keeps stable v1 and experimental v2 runner configurations side by
  # side. A configuration key must belong to exactly one input so its module address and output
  # contract remain unambiguous.
  multi_runner_config = merge(local.multi_runner_config_v1_as_v2, var.experimental.multi_runner_config_v2)

  runner_extra_labels = {
    for k, v in local.multi_runner_config : k => sort(setunion(flatten(v.matcherConfig.labelMatchers), compact(v.runner.extra_labels)))
  }

  runner_config = {
    for k, v in local.multi_runner_config : k => merge(v, {
      id             = aws_sqs_queue.queued_builds[k].id
      arn            = aws_sqs_queue.queued_builds[k].arn
      url            = aws_sqs_queue.queued_builds[k].url
      runnerProvider = lower(trimspace(v.compute_provider.type))
      runner         = merge(v.runner, { extra_labels = local.runner_extra_labels[k] })
    })
  }

  # Preserve the exact stable v1 shape for the legacy module call. The v1-to-v2
  # translation above is intentionally limited to shared multi-runner consumers.
  runner_extra_labels_v1 = {
    for k, v in var.multi_runner_config :
    k => sort(setunion(flatten(v.matcherConfig.labelMatchers), compact(v.runner_config.runner_extra_labels)))
  }

  runner_config_v1 = {
    for k, v in var.multi_runner_config : k => merge(
      {
        id  = aws_sqs_queue.queued_builds[k].id
        arn = aws_sqs_queue.queued_builds[k].arn
        url = aws_sqs_queue.queued_builds[k].url
      },
      merge(v, {
        runner_config = merge(v.runner_config, {
          runner_extra_labels = local.runner_extra_labels_v1[k]
        })
      }),
    )
  }

  runner_config_v2 = {
    for k, v in local.runner_config : k => v
    if contains(keys(var.experimental.multi_runner_config_v2), k)
  }

  runner_matcher_config = {
    for k, v in local.runner_config : k => {
      id             = v.id
      arn            = v.arn
      runnerProvider = v.runnerProvider
      matcherConfig  = v.matcherConfig
    }
  }

  runner_config_by_provider = {
    ec2 = {
      for k, v in local.runner_config : k => v
      if v.runnerProvider == "ec2"
    }
  }

  tmp_distinct_list_unique_os_and_arch = distinct([
    for _, config in local.runner_config_by_provider.ec2 : {
      "os_type" : config.runner.os,
      "architecture" : config.runner.architecture
    }
    if config.compute_provider.ec2.binaries_syncer.enabled
  ])
  unique_os_and_arch = { for _, v in local.tmp_distinct_list_unique_os_and_arch : "${v.os_type}_${v.architecture}" => v }
}
