module "runners" {
  source   = "../runners"
  for_each = local.runner_config_v1

  aws_region    = var.aws_region
  aws_partition = var.aws_partition
  vpc_id        = coalesce(each.value.compute_provider.ec2.vpc_id, var.vpc_id)
  subnet_ids    = coalesce(each.value.compute_provider.ec2.subnet_ids, var.subnet_ids)
  prefix        = "${var.prefix}-${each.key}"
  tags = merge(local.tags, {
    "ghr:environment" = "${var.prefix}-${each.key}"
  })

  s3_runner_binaries = each.value.compute_provider.ec2.binaries_syncer.enabled ? local.runner_binaries_by_os_and_arch_map["${each.value.runner.os}_${each.value.runner.architecture}"] : null

  ssm_paths = {
    root   = "${local.ssm_root_path}/${each.key}"
    tokens = "${var.ssm_paths.runners}/tokens"
    config = "${var.ssm_paths.runners}/config"
  }

  runner_os                     = each.value.runner.os
  instance_types                = each.value.compute_provider.ec2.instance_types
  instance_target_capacity_type = each.value.compute_provider.ec2.instance_target_capacity_type
  instance_allocation_strategy  = each.value.compute_provider.ec2.instance_allocation_strategy
  instance_type_priorities      = each.value.compute_provider.ec2.instance_type_priorities
  instance_max_spot_price       = each.value.compute_provider.ec2.instance_max_spot_price
  block_device_mappings         = each.value.compute_provider.ec2.block_device_mappings

  runner_architecture = each.value.runner.architecture
  ami                 = each.value.compute_provider.ec2.ami

  sqs_build_queue                      = { "arn" : each.value.arn, "url" : each.value.url }
  github_app_parameters                = local.github_app_parameters
  ebs_optimized                        = each.value.compute_provider.ec2.ebs_optimized
  enable_on_demand_failover_for_errors = each.value.compute_provider.ec2.enable_on_demand_failover_for_errors
  scale_errors                         = each.value.compute_provider.ec2.scale_errors
  enable_organization_runners          = each.value.github.organization_runners
  enable_ephemeral_runners             = each.value.runner.ephemeral
  enable_jit_config                    = each.value.runner.jit_config_enabled
  enable_job_queued_check              = each.value.scale_up.job_queued_check_enabled
  disable_runner_autoupdate            = each.value.runner.auto_update_disabled
  enable_managed_runner_security_group = var.enable_managed_runner_security_group
  enable_runner_detailed_monitoring    = each.value.compute_provider.ec2.detailed_monitoring_enabled
  scale_down_schedule_expression       = each.value.scale_down.schedule_expression
  minimum_running_time_in_minutes      = each.value.scale_down.minimum_running_time_in_minutes
  runner_boot_time_in_minutes          = each.value.runner.boot_time_in_minutes
  runner_disable_default_labels        = each.value.runner.disable_default_labels
  runner_labels                        = each.value.runner.disable_default_labels ? sort(distinct(each.value.runner.extra_labels)) : sort(distinct(concat(["self-hosted", each.value.runner.os, each.value.runner.architecture], each.value.runner.extra_labels)))
  runner_as_root                       = each.value.runner.run_as_root
  runner_run_as                        = each.value.runner.run_as
  runners_maximum_count                = each.value.runner.maximum_count
  idle_config                          = each.value.scale_down.idle_config
  enable_ssm_on_runners                = each.value.compute_provider.ec2.ssm_enabled
  egress_rules                         = var.runner_egress_rules
  runner_additional_security_group_ids = try(coalescelist(each.value.compute_provider.ec2.additional_security_group_ids, var.runner_additional_security_group_ids), [])
  metadata_options                     = each.value.compute_provider.ec2.metadata_options
  credit_specification                 = each.value.compute_provider.ec2.credit_specification
  cpu_options                          = each.value.compute_provider.ec2.cpu_options
  placement                            = each.value.compute_provider.ec2.placement
  license_specifications               = each.value.compute_provider.ec2.license_specifications
  use_dedicated_host                   = each.value.compute_provider.ec2.use_dedicated_host

  enable_runner_binaries_syncer                                  = each.value.compute_provider.ec2.binaries_syncer.enabled
  lambda_s3_bucket                                               = var.lambda_s3_bucket
  runners_lambda_s3_key                                          = var.runners_lambda_s3_key
  runners_lambda_s3_object_version                               = var.runners_lambda_s3_object_version
  lambda_runtime                                                 = var.lambda_runtime
  lambda_architecture                                            = var.lambda_architecture
  lambda_zip                                                     = var.runners_lambda_zip
  lambda_scale_up_memory_size                                    = var.scale_up_lambda_memory_size
  lambda_event_source_mapping_batch_size                         = coalesce(each.value.queue.event_source_mapping.batch_size, var.lambda_event_source_mapping_batch_size)
  lambda_event_source_mapping_maximum_batching_window_in_seconds = coalesce(each.value.queue.event_source_mapping.maximum_batching_window_in_seconds, var.lambda_event_source_mapping_maximum_batching_window_in_seconds)
  lambda_timeout_scale_up                                        = var.runners_scale_up_lambda_timeout
  lambda_scale_down_memory_size                                  = var.scale_down_lambda_memory_size
  lambda_timeout_scale_down                                      = var.runners_scale_down_lambda_timeout
  lambda_subnet_ids                                              = var.lambda_subnet_ids
  lambda_security_group_ids                                      = var.lambda_security_group_ids
  lambda_tags                                                    = var.lambda_tags
  tracing_config                                                 = var.tracing_config
  logging_retention_in_days                                      = var.logging_retention_in_days
  logging_kms_key_id                                             = var.logging_kms_key_id
  log_class                                                      = var.log_class
  enable_cloudwatch_agent                                        = each.value.compute_provider.ec2.cloudwatch_agent.enabled
  cloudwatch_config                                              = try(coalesce(each.value.compute_provider.ec2.cloudwatch_agent.config, var.cloudwatch_config), null)
  runner_log_files                                               = each.value.compute_provider.ec2.log_files
  runner_group_name                                              = each.value.runner.group_name
  runner_name_prefix                                             = each.value.runner.name_prefix
  parameter_store_tags                                           = var.parameter_store_tags

  scale_up_reserved_concurrent_executions = each.value.scale_up.reserved_concurrent_executions

  instance_profile_path     = var.instance_profile_path
  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary

  enable_userdata           = each.value.compute_provider.ec2.user_data.enabled
  userdata_template         = each.value.compute_provider.ec2.user_data.template
  userdata_content          = each.value.compute_provider.ec2.user_data.content
  userdata_pre_install      = each.value.compute_provider.ec2.user_data.pre_install
  userdata_post_install     = each.value.compute_provider.ec2.user_data.post_install
  runner_hook_job_started   = each.value.runner.hooks.job_started
  runner_hook_job_completed = each.value.runner.hooks.job_completed
  key_name                  = var.key_name
  runner_ec2_tags           = each.value.compute_provider.ec2.tags

  create_service_linked_role_spot = each.value.compute_provider.ec2.create_service_linked_role_spot

  # Preserve stable v1 values verbatim rather than reconstructing legacy IAM
  # inputs from the canonical normalized representation.
  runner_iam_role_managed_policy_arns = var.multi_runner_config[each.key].runner_config.runner_iam_role_managed_policy_arns
  iam_overrides                       = var.multi_runner_config[each.key].runner_config.iam_overrides

  ghes_url        = var.ghes_url
  ghes_ssl_verify = var.ghes_ssl_verify
  user_agent      = var.user_agent

  kms_key_arn = var.kms_key_arn

  log_level = var.log_level

  pool_config                                = each.value.pool.config
  pool_lambda_timeout                        = var.pool_lambda_timeout
  pool_runner_owner                          = each.value.pool.runner_owner
  pool_lambda_reserved_concurrent_executions = var.pool_lambda_reserved_concurrent_executions
  associate_public_ipv4_address              = var.associate_public_ipv4_address

  ssm_housekeeper = var.runners_ssm_housekeeper

  job_retry = var.multi_runner_config[each.key].runner_config.job_retry

  metrics = var.metrics
}

module "runner_stacks" {
  source   = "../runner-stack"
  for_each = local.runner_config_v2

  aws_region    = var.aws_region
  aws_partition = var.aws_partition
  prefix        = "${var.prefix}-${each.key}"
  tags = merge(local.tags, {
    "ghr:environment" = "${var.prefix}-${each.key}"
  })

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
    hooks                  = each.value.runner.hooks
    iam = {
      role                 = each.value.runner.iam.role
      managed_policy_arns  = each.value.runner.iam.managed_policy_arns
      path                 = each.value.runner.iam.path != null ? each.value.runner.iam.path : var.role_path
      permissions_boundary = each.value.runner.iam.permissions_boundary != null ? each.value.runner.iam.permissions_boundary : var.role_permissions_boundary
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
    tags               = var.lambda_tags
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
  }

  scale_down = {
    memory_size                     = var.scale_down_lambda_memory_size
    timeout                         = var.runners_scale_down_lambda_timeout
    schedule_expression             = each.value.scale_down.schedule_expression
    minimum_running_time_in_minutes = each.value.scale_down.minimum_running_time_in_minutes
    idle_config                     = each.value.scale_down.idle_config
  }

  pool = {
    config               = each.value.pool.config
    include_busy_runners = false
    runner_owner         = each.value.pool.runner_owner
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
    kms_key_arn    = var.kms_key_arn
    parameter_tags = var.parameter_store_tags
    housekeeper = {
      schedule_expression = var.runners_ssm_housekeeper.schedule_expression
      state               = var.runners_ssm_housekeeper.enabled ? "ENABLED" : "DISABLED"
      lambda = {
        memory_size = var.runners_ssm_housekeeper.lambda_memory_size
        timeout     = var.runners_ssm_housekeeper.lambda_timeout
      }
      config = var.runners_ssm_housekeeper.config
    }
  }

  observability = {
    log_level = var.log_level
    logs = {
      retention_in_days = var.logging_retention_in_days
      kms_key_id        = var.logging_kms_key_id
      class             = var.log_class
    }
    tracing = var.tracing_config
    metrics = var.metrics
  }

  compute_provider = {
    type = each.value.runnerProvider
    ec2 = {
      ami                                  = each.value.compute_provider.ec2.ami
      vpc_id                               = coalesce(each.value.compute_provider.ec2.vpc_id, var.vpc_id)
      subnet_ids                           = coalesce(each.value.compute_provider.ec2.subnet_ids, var.subnet_ids)
      instance_types                       = each.value.compute_provider.ec2.instance_types
      instance_target_capacity_type        = each.value.compute_provider.ec2.instance_target_capacity_type
      instance_allocation_strategy         = each.value.compute_provider.ec2.instance_allocation_strategy
      instance_type_priorities             = each.value.compute_provider.ec2.instance_type_priorities
      instance_max_spot_price              = each.value.compute_provider.ec2.instance_max_spot_price
      block_device_mappings                = each.value.compute_provider.ec2.block_device_mappings
      ebs_optimized                        = each.value.compute_provider.ec2.ebs_optimized
      instance_profile                     = each.value.compute_provider.ec2.instance_profile
      instance_profile_path                = var.instance_profile_path
      enable_on_demand_failover_for_errors = each.value.compute_provider.ec2.enable_on_demand_failover_for_errors
      scale_errors                         = each.value.compute_provider.ec2.scale_errors
      managed_security_group_enabled       = var.enable_managed_runner_security_group
      detailed_monitoring_enabled          = each.value.compute_provider.ec2.detailed_monitoring_enabled
      ssm_enabled                          = each.value.compute_provider.ec2.ssm_enabled
      egress_rules                         = var.runner_egress_rules
      additional_security_group_ids        = try(coalescelist(each.value.compute_provider.ec2.additional_security_group_ids, var.runner_additional_security_group_ids), [])
      metadata_options                     = each.value.compute_provider.ec2.metadata_options
      credit_specification                 = each.value.compute_provider.ec2.credit_specification
      cpu_options                          = each.value.compute_provider.ec2.cpu_options
      placement                            = each.value.compute_provider.ec2.placement
      license_specifications               = each.value.compute_provider.ec2.license_specifications
      use_dedicated_host                   = each.value.compute_provider.ec2.use_dedicated_host
      binaries_syncer = {
        enabled = each.value.compute_provider.ec2.binaries_syncer.enabled
        s3      = each.value.compute_provider.ec2.binaries_syncer.enabled ? local.runner_binaries_by_os_and_arch_map["${each.value.runner.os}_${each.value.runner.architecture}"] : null
      }
      cloudwatch_agent = {
        enabled = each.value.compute_provider.ec2.cloudwatch_agent.enabled
        config  = try(coalesce(each.value.compute_provider.ec2.cloudwatch_agent.config, var.cloudwatch_config), null)
      }
      log_files = each.value.compute_provider.ec2.log_files
      user_data = each.value.compute_provider.ec2.user_data
      key_name  = var.key_name
      tags      = each.value.compute_provider.ec2.tags

      create_service_linked_role_spot = each.value.compute_provider.ec2.create_service_linked_role_spot
      associate_public_ipv4_address   = var.associate_public_ipv4_address
    }
  }
}
