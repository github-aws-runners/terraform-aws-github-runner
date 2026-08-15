module "runners" {
  source   = "../runners"
  for_each = local.use_multi_runner_config_v2 ? {} : local.translated_experimental.multi_runner_config

  aws_region    = var.aws_region
  aws_partition = var.aws_partition
  vpc_id        = each.value.compute_provider.ec2.vpc_id
  subnet_ids    = each.value.compute_provider.ec2.subnet_ids
  prefix        = "${var.prefix}-${each.key}"
  tags = merge(each.value.tags, {
    "ghr:environment" = "${var.prefix}-${each.key}"
  })

  s3_runner_binaries = each.value.compute_provider.ec2.binaries_syncer.s3

  ssm_paths = each.value.ssm.paths

  runner_os                     = each.value.runner.os
  instance_types                = each.value.compute_provider.ec2.instance_types
  instance_target_capacity_type = each.value.compute_provider.ec2.instance_target_capacity_type
  instance_allocation_strategy  = each.value.compute_provider.ec2.instance_allocation_strategy
  instance_type_priorities      = each.value.compute_provider.ec2.instance_type_priorities
  instance_max_spot_price       = each.value.compute_provider.ec2.instance_max_spot_price
  block_device_mappings         = each.value.compute_provider.ec2.block_device_mappings

  runner_architecture = each.value.runner.architecture
  ami = each.value.compute_provider.ec2.ami == null ? null : {
    filter               = each.value.compute_provider.ec2.ami.filter
    owners               = each.value.compute_provider.ec2.ami.owners
    id_ssm_parameter_arn = try(each.value.compute_provider.ec2.ami.id_ssm_parameter.arn, null)
    kms_key_arn          = try(each.value.compute_provider.ec2.ami.kms_key.arn, null)
  }

  sqs_build_queue = {
    arn = aws_sqs_queue.queued_builds[each.key].arn
    url = aws_sqs_queue.queued_builds[each.key].url
  }
  github_app_parameters                = local.github_app_parameters
  ebs_optimized                        = each.value.compute_provider.ec2.ebs_optimized
  enable_on_demand_failover_for_errors = each.value.compute_provider.ec2.enable_on_demand_failover_for_errors
  scale_errors                         = each.value.compute_provider.ec2.scale_errors
  enable_organization_runners          = each.value.github.organization_runners
  enable_ephemeral_runners             = each.value.runner.ephemeral
  enable_jit_config                    = each.value.runner.jit_config_enabled
  enable_job_queued_check              = each.value.lambda.scale_up.job_queued_check_enabled
  disable_runner_autoupdate            = each.value.runner.auto_update_disabled
  enable_managed_runner_security_group = each.value.compute_provider.ec2.managed_security_group_enabled
  enable_runner_detailed_monitoring    = each.value.compute_provider.ec2.detailed_monitoring_enabled
  scale_down_schedule_expression       = each.value.lambda.scale_down.schedule_expression
  minimum_running_time_in_minutes      = each.value.lambda.scale_down.minimum_running_time_in_minutes
  runner_boot_time_in_minutes          = each.value.runner.boot_time_in_minutes
  runner_disable_default_labels        = each.value.runner.disable_default_labels
  runner_labels                        = each.value.runner.labels
  runner_as_root                       = each.value.runner.run_as_root
  runner_run_as                        = each.value.runner.run_as
  runners_maximum_count                = each.value.runner.maximum_count
  idle_config                          = each.value.lambda.scale_down.idle_config
  enable_ssm_on_runners                = each.value.compute_provider.ec2.ssm_enabled
  egress_rules                         = each.value.compute_provider.ec2.egress_rules
  runner_additional_security_group_ids = each.value.compute_provider.ec2.additional_security_group_ids
  metadata_options                     = each.value.compute_provider.ec2.metadata_options
  credit_specification                 = each.value.compute_provider.ec2.credit_specification
  cpu_options                          = each.value.compute_provider.ec2.cpu_options
  placement                            = each.value.compute_provider.ec2.placement
  license_specifications               = each.value.compute_provider.ec2.license_specifications
  use_dedicated_host                   = each.value.compute_provider.ec2.use_dedicated_host

  enable_runner_binaries_syncer                                  = each.value.compute_provider.ec2.binaries_syncer.enabled
  lambda_s3_bucket                                               = local.translated_experimental.lambda.scale.artifact.s3 == null ? null : local.translated_experimental.lambda.artifact.s3.bucket
  runners_lambda_s3_key                                          = try(local.translated_experimental.lambda.scale.artifact.s3.key, null)
  runners_lambda_s3_object_version                               = try(local.translated_experimental.lambda.scale.artifact.s3.object_version, null)
  lambda_runtime                                                 = each.value.lambda.runtime
  lambda_architecture                                            = each.value.lambda.architecture
  lambda_zip                                                     = local.translated_experimental.lambda.scale.artifact.zip
  lambda_scale_up_memory_size                                    = each.value.lambda.scale_up.memory_size
  lambda_event_source_mapping_batch_size                         = each.value.queue.event_source_mapping.batch_size
  lambda_event_source_mapping_maximum_batching_window_in_seconds = each.value.queue.event_source_mapping.maximum_batching_window_in_seconds
  lambda_timeout_scale_up                                        = each.value.lambda.scale_up.timeout
  lambda_scale_down_memory_size                                  = each.value.lambda.scale_down.memory_size
  lambda_timeout_scale_down                                      = each.value.lambda.scale_down.timeout
  lambda_subnet_ids                                              = each.value.lambda.subnet_ids
  lambda_security_group_ids                                      = each.value.lambda.security_group_ids
  lambda_tags                                                    = each.value.lambda.tags
  tracing_config                                                 = each.value.observability.tracing
  logging_retention_in_days                                      = each.value.observability.logs.retention_in_days
  logging_kms_key_id                                             = each.value.observability.logs.kms_key_id
  log_class                                                      = each.value.observability.logs.class
  enable_cloudwatch_agent                                        = each.value.compute_provider.ec2.cloudwatch_agent.enabled
  cloudwatch_config                                              = each.value.compute_provider.ec2.cloudwatch_agent.config
  runner_log_files                                               = each.value.compute_provider.ec2.log_files
  runner_group_name                                              = each.value.runner.group_name
  runner_name_prefix                                             = each.value.runner.name_prefix
  parameter_store_tags                                           = each.value.ssm.parameters.tags

  scale_up_reserved_concurrent_executions = each.value.lambda.scale_up.reserved_concurrent_executions

  instance_profile_path     = each.value.compute_provider.ec2.instance_profile_path
  role_path                 = each.value.runner.iam.path
  role_permissions_boundary = each.value.runner.iam.permissions_boundary

  enable_userdata                = each.value.compute_provider.ec2.user_data.enabled
  userdata_template              = each.value.compute_provider.ec2.user_data.template
  userdata_content               = each.value.compute_provider.ec2.user_data.content
  userdata_pre_install           = each.value.compute_provider.ec2.user_data.pre_install
  userdata_post_install          = each.value.compute_provider.ec2.user_data.post_install
  enable_user_data_debug_logging = each.value.compute_provider.ec2.user_data.debug_logging_enabled
  runner_hook_job_started        = each.value.runner.hooks.job_started
  runner_hook_job_completed      = each.value.runner.hooks.job_completed
  key_name                       = each.value.compute_provider.ec2.key_name
  runner_ec2_tags                = each.value.compute_provider.ec2.tags

  create_service_linked_role_spot = each.value.compute_provider.ec2.create_service_linked_role_spot

  runner_iam_role_managed_policy_arns = values(each.value.runner.iam.managed_policy_arns)
  iam_overrides = {
    override_instance_profile = each.value.compute_provider.ec2.instance_profile != null
    instance_profile_name     = try(each.value.compute_provider.ec2.instance_profile.name, null)
    override_runner_role      = each.value.runner.iam.role != null
    runner_role_arn           = try(each.value.runner.iam.role.arn, null)
  }

  ghes_url        = local.translated_experimental.github.enterprise_server.url
  ghes_ssl_verify = local.translated_experimental.github.enterprise_server.ssl_verify
  user_agent      = local.translated_experimental.github.user_agent

  kms_key_arn = local.translated_experimental.ssm.kms_key_id

  log_level = each.value.observability.logs.level

  pool_config                                = each.value.lambda.pool.config
  pool_lambda_timeout                        = each.value.lambda.pool.lambda.timeout
  pool_lambda_memory_size                    = each.value.lambda.pool.lambda.memory_size
  pool_runner_owner                          = each.value.lambda.pool.runner_owner
  pool_include_busy_runners                  = each.value.lambda.pool.include_busy_runners
  pool_lambda_reserved_concurrent_executions = each.value.lambda.pool.lambda.reserved_concurrent_executions
  associate_public_ipv4_address              = each.value.compute_provider.ec2.associate_public_ipv4_address

  ssm_housekeeper = {
    schedule_expression = each.value.ssm.housekeeper.schedule_expression
    state               = each.value.ssm.housekeeper.state
    lambda_memory_size  = each.value.ssm.housekeeper.lambda.memory_size
    lambda_timeout      = each.value.ssm.housekeeper.lambda.timeout
    config              = each.value.ssm.housekeeper.config
  }

  job_retry = {
    enable                                = each.value.job_retry.enabled
    delay_in_seconds                      = each.value.job_retry.delay_in_seconds
    delay_backoff                         = each.value.job_retry.delay_backoff
    lambda_memory_size                    = each.value.job_retry.lambda.memory_size
    lambda_reserved_concurrent_executions = each.value.job_retry.lambda.reserved_concurrent_executions
    lambda_timeout                        = each.value.job_retry.lambda.timeout
    max_attempts                          = each.value.job_retry.max_attempts
  }

  metrics = {
    enable    = each.value.observability.metrics.enable
    namespace = each.value.observability.metrics.namespace
    metric = {
      enable_github_app_rate_limit    = each.value.observability.metrics.metric.enable_github_app_rate_limit
      enable_job_retry                = each.value.observability.metrics.metric.enable_job_retry
      enable_spot_termination_warning = local.translated_experimental.observability.metrics.metric.enable_spot_termination_warning
    }
  }
}
