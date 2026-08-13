locals {
  runner_config_v2 = {
    for k, v in local.selected_multi_runner_config_v2 : k => merge(v, {
      id  = aws_sqs_queue.queued_builds[k].id
      arn = aws_sqs_queue.queued_builds[k].arn
      url = aws_sqs_queue.queued_builds[k].url
      runner = merge(v.runner, {
        extra_labels = sort(setunion(flatten(v.matcherConfig.labelMatchers), compact(v.runner.extra_labels)))
      })
    })
  }

  runner_config_v2_compute_provider = {
    for k, v in local.runner_config_v2 : k => merge(
      local.compute_provider_types[k] == "ec2" ? {
        (local.compute_provider_types[k]) = {
          ami                                  = v.compute_provider.ec2.ami
          vpc_id                               = coalesce(v.compute_provider.ec2.vpc_id, var.vpc_id)
          subnet_ids                           = coalesce(v.compute_provider.ec2.subnet_ids, var.subnet_ids)
          instance_types                       = v.compute_provider.ec2.instance_types
          instance_target_capacity_type        = v.compute_provider.ec2.instance_target_capacity_type
          instance_allocation_strategy         = v.compute_provider.ec2.instance_allocation_strategy
          instance_type_priorities             = v.compute_provider.ec2.instance_type_priorities
          instance_max_spot_price              = v.compute_provider.ec2.instance_max_spot_price
          block_device_mappings                = v.compute_provider.ec2.block_device_mappings
          ebs_optimized                        = v.compute_provider.ec2.ebs_optimized
          instance_profile                     = v.compute_provider.ec2.instance_profile
          instance_profile_path                = var.instance_profile_path
          enable_on_demand_failover_for_errors = v.compute_provider.ec2.enable_on_demand_failover_for_errors
          scale_errors                         = v.compute_provider.ec2.scale_errors
          managed_security_group_enabled       = var.enable_managed_runner_security_group
          detailed_monitoring_enabled          = v.compute_provider.ec2.detailed_monitoring_enabled
          ssm_enabled                          = v.compute_provider.ec2.ssm_enabled
          egress_rules                         = var.runner_egress_rules
          additional_security_group_ids        = try(coalescelist(v.compute_provider.ec2.additional_security_group_ids, var.runner_additional_security_group_ids), [])
          metadata_options                     = v.compute_provider.ec2.metadata_options
          credit_specification                 = v.compute_provider.ec2.credit_specification
          cpu_options                          = v.compute_provider.ec2.cpu_options
          placement                            = v.compute_provider.ec2.placement
          license_specifications               = v.compute_provider.ec2.license_specifications
          use_dedicated_host                   = v.compute_provider.ec2.use_dedicated_host
          binaries_syncer = {
            enabled = v.compute_provider.ec2.binaries_syncer.enabled
            s3      = v.compute_provider.ec2.binaries_syncer.enabled ? local.runner_binaries_by_os_and_arch_map["${v.runner.os}_${v.runner.architecture}"] : null
          }
          cloudwatch_agent = {
            enabled = v.compute_provider.ec2.cloudwatch_agent.enabled
            config  = try(coalesce(v.compute_provider.ec2.cloudwatch_agent.config, var.cloudwatch_config), null)
          }
          log_files = v.compute_provider.ec2.log_files
          user_data = v.compute_provider.ec2.user_data
          key_name  = var.key_name
          tags      = v.compute_provider.ec2.tags

          create_service_linked_role_spot = v.compute_provider.ec2.create_service_linked_role_spot
          associate_public_ipv4_address   = var.associate_public_ipv4_address
        }
      } : {},
      local.compute_provider_types[k] != "ec2" ? {
        (local.compute_provider_types[k]) = v.compute_provider[local.compute_provider_types[k]]
      } : {},
    )
  }
}

module "runner_stacks" {
  source   = "../runner-stack"
  for_each = local.runner_config_v2

  aws_region    = var.aws_region
  aws_partition = var.aws_partition
  prefix        = "${var.prefix}-${each.key}"
  tags          = merge(var.tags, each.value.tags)

  runner = {
    os                     = each.value.runner.os
    architecture           = each.value.runner.architecture
    boot_time_in_minutes   = each.value.runner.boot_time_in_minutes
    disable_default_labels = each.value.runner.disable_default_labels
    labels                 = each.value.runner.disable_default_labels ? sort(distinct(each.value.runner.extra_labels)) : sort(distinct(concat(["self-hosted", each.value.runner.os, each.value.runner.architecture], each.value.runner.extra_labels)))
    group_name             = each.value.runner.group_name
    name_prefix            = each.value.runner.name_prefix
    run_as_root            = each.value.runner.run_as_root
    run_as                 = each.value.runner.run_as
    maximum_count          = each.value.runner.maximum_count
    ephemeral              = each.value.runner.ephemeral
    jit_config_enabled     = each.value.runner.jit_config_enabled
    auto_update_disabled   = each.value.runner.auto_update_disabled
    tags                   = each.value.runner.tags
    hooks                  = each.value.runner.hooks
    iam = {
      role                         = each.value.runner.iam.role
      managed_policy_arns          = each.value.runner.iam.managed_policy_arns
      additional_trust_policy_json = each.value.runner.iam.additional_trust_policy_json
      path                         = each.value.runner.iam.path != null ? each.value.runner.iam.path : var.role_path
      permissions_boundary         = each.value.runner.iam.permissions_boundary != null ? each.value.runner.iam.permissions_boundary : var.role_permissions_boundary
    }
  }

  github = {
    app_parameters       = local.github_app_parameters
    organization_runners = each.value.github.organization_runners
    enterprise_server = {
      url        = var.ghes_url
      ssl_verify = var.ghes_ssl_verify
    }
    user_agent = var.user_agent
  }

  queue = {
    build = {
      arn = each.value.arn
      url = each.value.url
    }
    event_source_mapping = {
      batch_size                         = coalesce(each.value.queue.event_source_mapping.batch_size, var.lambda_event_source_mapping_batch_size)
      maximum_batching_window_in_seconds = coalesce(each.value.queue.event_source_mapping.maximum_batching_window_in_seconds, var.lambda_event_source_mapping_maximum_batching_window_in_seconds)
    }
    tags = each.value.queue.tags
  }

  lambda = {
    zip = var.runners_lambda_zip
    s3 = {
      bucket         = var.lambda_s3_bucket
      key            = var.runners_lambda_s3_key
      object_version = var.runners_lambda_s3_object_version
    }
    runtime            = var.lambda_runtime
    architecture       = var.lambda_architecture
    subnet_ids         = var.lambda_subnet_ids
    security_group_ids = var.lambda_security_group_ids
    tags               = merge(var.lambda_tags, each.value.lambda.tags)
    role = {
      path                 = var.role_path
      permissions_boundary = var.role_permissions_boundary
    }
  }

  scale_up = {
    memory_size                    = var.scale_up_lambda_memory_size
    timeout                        = var.runners_scale_up_lambda_timeout
    reserved_concurrent_executions = each.value.scale_up.reserved_concurrent_executions
    job_queued_check_enabled       = each.value.scale_up.job_queued_check_enabled
    tags                           = each.value.scale_up.tags
  }

  scale_down = {
    memory_size                     = var.scale_down_lambda_memory_size
    timeout                         = var.runners_scale_down_lambda_timeout
    schedule_expression             = each.value.scale_down.schedule_expression
    minimum_running_time_in_minutes = each.value.scale_down.minimum_running_time_in_minutes
    idle_config                     = each.value.scale_down.idle_config
    tags                            = each.value.scale_down.tags
  }

  pool = {
    config               = each.value.pool.config
    include_busy_runners = false
    runner_owner         = each.value.pool.runner_owner
    tags                 = each.value.pool.tags
    lambda = {
      timeout                        = var.pool_lambda_timeout
      reserved_concurrent_executions = var.pool_lambda_reserved_concurrent_executions
    }
  }

  job_retry = each.value.job_retry

  ssm = {
    paths = {
      root   = "${local.ssm_root_path}/${each.key}"
      tokens = "${var.ssm_paths.runners}/tokens"
      config = "${var.ssm_paths.runners}/config"
    }
    kms_key = each.value.ssm.kms_key
    tags    = each.value.ssm.tags
    parameters = {
      tags = merge(var.parameter_store_tags, each.value.ssm.parameters.tags)
    }
    housekeeper = {
      schedule_expression = var.runners_ssm_housekeeper.schedule_expression
      state               = var.runners_ssm_housekeeper.enabled ? "ENABLED" : "DISABLED"
      tags                = each.value.ssm.housekeeper.tags
      lambda = {
        memory_size = var.runners_ssm_housekeeper.lambda_memory_size
        timeout     = var.runners_ssm_housekeeper.lambda_timeout
      }
      config = var.runners_ssm_housekeeper.config
    }
  }

  observability = {
    logs = {
      level             = var.log_level
      retention_in_days = var.logging_retention_in_days
      kms_key_id        = var.logging_kms_key_id
      class             = var.log_class
      tags              = each.value.observability.logs.tags
    }
    tracing = var.tracing_config
    metrics = var.metrics
  }

  compute_provider = local.runner_config_v2_compute_provider[each.key]
}
