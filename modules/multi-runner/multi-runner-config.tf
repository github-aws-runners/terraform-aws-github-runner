locals {
  multi_runner_config_v1_as_v2 = {
    for k, v in var.multi_runner_config : k => {
      runner = {
        runner_os                               = v.runner_config.runner_os
        runner_architecture                     = v.runner_config.runner_architecture
        disable_runner_autoupdate               = v.runner_config.disable_runner_autoupdate
        enable_ephemeral_runners                = v.runner_config.enable_ephemeral_runners
        enable_job_queued_check                 = v.runner_config.enable_job_queued_check
        enable_jit_config                       = v.runner_config.enable_jit_config
        enable_organization_runners             = v.runner_config.enable_organization_runners
        idle_config                             = v.runner_config.idle_config
        minimum_running_time_in_minutes         = v.runner_config.minimum_running_time_in_minutes
        pool_runner_owner                       = v.runner_config.pool_runner_owner
        runner_as_root                          = v.runner_config.runner_as_root
        runner_boot_time_in_minutes             = v.runner_config.runner_boot_time_in_minutes
        runner_disable_default_labels           = v.runner_config.runner_disable_default_labels
        runner_extra_labels                     = v.runner_config.runner_extra_labels
        runner_group_name                       = v.runner_config.runner_group_name
        runner_name_prefix                      = v.runner_config.runner_name_prefix
        runner_run_as                           = v.runner_config.runner_run_as
        runners_maximum_count                   = v.runner_config.runners_maximum_count
        scale_down_schedule_expression          = v.runner_config.scale_down_schedule_expression
        scale_up_reserved_concurrent_executions = v.runner_config.scale_up_reserved_concurrent_executions
        pool_config                             = v.runner_config.pool_config
        job_retry                               = v.runner_config.job_retry
      }

      provider = {
        type = "ec2"
        ec2 = {
          runner_metadata_options              = v.runner_config.runner_metadata_options
          ami                                  = v.runner_config.ami
          block_device_mappings                = v.runner_config.block_device_mappings
          cloudwatch_config                    = v.runner_config.cloudwatch_config
          create_service_linked_role_spot      = v.runner_config.create_service_linked_role_spot
          credit_specification                 = v.runner_config.credit_specification
          ebs_optimized                        = v.runner_config.ebs_optimized
          enable_cloudwatch_agent              = v.runner_config.enable_cloudwatch_agent
          enable_runner_binaries_syncer        = v.runner_config.enable_runner_binaries_syncer
          enable_runner_detailed_monitoring    = v.runner_config.enable_runner_detailed_monitoring
          enable_ssm_on_runners                = v.runner_config.enable_ssm_on_runners
          enable_userdata                      = v.runner_config.enable_userdata
          instance_allocation_strategy         = v.runner_config.instance_allocation_strategy
          instance_max_spot_price              = v.runner_config.instance_max_spot_price
          instance_target_capacity_type        = v.runner_config.instance_target_capacity_type
          instance_type_priorities             = v.runner_config.instance_type_priorities
          instance_types                       = v.runner_config.instance_types
          runner_additional_security_group_ids = v.runner_config.runner_additional_security_group_ids
          runner_iam_role_managed_policy_arns  = v.runner_config.runner_iam_role_managed_policy_arns
          iam_overrides                        = v.runner_config.iam_overrides
          enable_on_demand_failover_for_errors = v.runner_config.enable_on_demand_failover_for_errors
          scale_errors                         = v.runner_config.scale_errors
          subnet_ids                           = v.runner_config.subnet_ids
          vpc_id                               = v.runner_config.vpc_id
          cpu_options                          = v.runner_config.cpu_options
          placement                            = v.runner_config.placement
          license_specifications               = v.runner_config.license_specifications
          use_dedicated_host                   = v.runner_config.use_dedicated_host
          runner_log_files                     = v.runner_config.runner_log_files
          runner_ec2_tags                      = v.runner_config.runner_ec2_tags
          runner_hook_job_completed            = v.runner_config.runner_hook_job_completed
          runner_hook_job_started              = v.runner_config.runner_hook_job_started
          userdata_content                     = v.runner_config.userdata_content
          userdata_post_install                = v.runner_config.userdata_post_install
          userdata_pre_install                 = v.runner_config.userdata_pre_install
          userdata_template                    = v.runner_config.userdata_template
        }
      }

      queue = {
        delay_webhook_event                                            = v.runner_config.delay_webhook_event
        job_queue_retention_in_seconds                                 = v.runner_config.job_queue_retention_in_seconds
        lambda_event_source_mapping_batch_size                         = v.runner_config.lambda_event_source_mapping_batch_size
        lambda_event_source_mapping_maximum_batching_window_in_seconds = v.runner_config.lambda_event_source_mapping_maximum_batching_window_in_seconds
        redrive_build_queue                                            = v.redrive_build_queue
      }

      matcherConfig = v.matcherConfig
    }
  }

  multi_runner_config = length(var.multi_runner_config_v2) > 0 ? var.multi_runner_config_v2 : local.multi_runner_config_v1_as_v2

  runner_extra_labels = {
    for k, v in local.multi_runner_config : k => sort(setunion(flatten(v.matcherConfig.labelMatchers), compact(v.runner.runner_extra_labels)))
  }

  runner_config = {
    for k, v in local.multi_runner_config : k => merge(v, {
      id             = aws_sqs_queue.queued_builds[k].id
      arn            = aws_sqs_queue.queued_builds[k].arn
      url            = aws_sqs_queue.queued_builds[k].url
      runnerProvider = lower(trimspace(v.provider.type))
      runner         = merge(v.runner, { runner_extra_labels = local.runner_extra_labels[k] })
    })
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
      "os_type" : config.runner.runner_os,
      "architecture" : config.runner.runner_architecture
    }
    if config.provider.ec2.enable_runner_binaries_syncer
  ])
  unique_os_and_arch = { for _, v in local.tmp_distinct_list_unique_os_and_arch : "${v.os_type}_${v.architecture}" => v }
}
