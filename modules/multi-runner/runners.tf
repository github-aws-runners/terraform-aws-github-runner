module "runners" {
  source        = "../runners"
  for_each      = local.effective_config.multi_runner_config
  aws_region    = var.aws_region
  aws_partition = var.aws_partition
  vpc_id        = each.value.compute_provider.aws.ec2.vpc_id
  subnet_ids    = each.value.compute_provider.aws.ec2.subnet_ids
  prefix        = "${var.prefix}-${each.key}"
  tags = merge(local.effective_config.tags, each.value.tags, {
    "ghr:environment" = "${var.prefix}-${each.key}"
  })

  s3_runner_binaries = try(each.value.compute_provider.aws.ec2.binaries_syncer.enabled, false) ? local.runner_binaries_by_os_and_arch_map["${each.value.runner.os}_${each.value.runner.architecture}"] : null

  ssm_paths = {
    root   = each.value.ssm.paths.root
    tokens = each.value.ssm.paths.tokens
    config = each.value.ssm.paths.config
  }

  runner_os                     = each.value.runner.os
  instance_types                = each.value.compute_provider.aws.ec2.instance_types
  instance_target_capacity_type = each.value.compute_provider.aws.ec2.instance_target_capacity_type
  instance_allocation_strategy  = each.value.compute_provider.aws.ec2.instance_allocation_strategy
  instance_type_priorities      = each.value.compute_provider.aws.ec2.instance_type_priorities
  instance_max_spot_price       = each.value.compute_provider.aws.ec2.instance_max_spot_price
  block_device_mappings         = each.value.compute_provider.aws.ec2.block_device_mappings

  runner_architecture = each.value.runner.architecture
  ami = try(each.value.compute_provider.aws.ec2.ami == null ? null : {
    filter               = each.value.compute_provider.aws.ec2.ami.filter
    owners               = each.value.compute_provider.aws.ec2.ami.owners
    id_ssm_parameter_arn = try(each.value.compute_provider.aws.ec2.ami.id_ssm_parameter.arn, null)
    kms_key_arn          = try(each.value.compute_provider.aws.ec2.ami.kms_key.arn, null)
  }, null)

  sqs_build_queue                      = { "arn" : aws_sqs_queue.queued_builds[each.key].arn, "url" : aws_sqs_queue.queued_builds[each.key].url }
  github_app_parameters                = local.github_app_parameters
  ebs_optimized                        = each.value.compute_provider.aws.ec2.ebs_optimized
  enable_on_demand_failover_for_errors = each.value.compute_provider.aws.ec2.on_demand_failover_for_errors
  scale_errors                         = each.value.compute_provider.aws.ec2.scale_errors
  enable_organization_runners          = each.value.orchestration_provider.webhook.github.organization_runners
  enable_ephemeral_runners             = each.value.orchestration_provider.webhook.runner.ephemeral
  enable_jit_config                    = each.value.orchestration_provider.webhook.runner.jit_config_enabled
  enable_job_queued_check              = each.value.orchestration_provider.webhook.lambda.scale.up.job_queued_check_enabled
  disable_runner_autoupdate            = each.value.runner.auto_update_disabled
  enable_managed_runner_security_group = each.value.compute_provider.aws.ec2.managed_security_group_enabled
  enable_runner_detailed_monitoring    = each.value.compute_provider.aws.ec2.detailed_monitoring_enabled
  scale_down_schedule_expression       = each.value.orchestration_provider.webhook.lambda.scale.down.schedule_expression
  minimum_running_time_in_minutes      = each.value.orchestration_provider.webhook.lambda.scale.down.minimum_running_time_in_minutes
  runner_boot_time_in_minutes          = each.value.orchestration_provider.webhook.runner.boot_time_in_minutes
  runner_disable_default_labels        = each.value.runner.disable_default_labels
  runner_labels                        = each.value.runner.disable_default_labels ? sort(distinct(each.value.runner.extra_labels)) : sort(distinct(concat(["self-hosted", each.value.runner.os, each.value.runner.architecture], each.value.runner.extra_labels)))
  runner_as_root                       = each.value.runner.run_as_root
  runner_run_as                        = each.value.runner.run_as
  runners_maximum_count                = each.value.orchestration_provider.webhook.runner.maximum_count
  idle_config                          = each.value.orchestration_provider.webhook.lambda.scale.down.idle_config
  enable_ssm_on_runners                = each.value.compute_provider.aws.ec2.ssm_enabled
  egress_rules                         = each.value.compute_provider.aws.ec2.egress_rules
  runner_additional_security_group_ids = each.value.compute_provider.aws.ec2.additional_security_group_ids
  metadata_options                     = each.value.compute_provider.aws.ec2.metadata_options
  credit_specification                 = each.value.compute_provider.aws.ec2.credit_specification
  cpu_options                          = each.value.compute_provider.aws.ec2.cpu_options
  placement                            = each.value.compute_provider.aws.ec2.placement
  license_specifications               = each.value.compute_provider.aws.ec2.license_specifications
  use_dedicated_host                   = each.value.compute_provider.aws.ec2.use_dedicated_host

  enable_runner_binaries_syncer                                  = each.value.compute_provider.aws.ec2.binaries_syncer.enabled
  lambda_s3_bucket                                               = try(local.effective_config.lambda.artifact.s3.bucket, null)
  runners_lambda_s3_key                                          = try(local.effective_config.orchestration_provider.webhook.lambda.artifact.s3.key, null)
  runners_lambda_s3_object_version                               = try(local.effective_config.orchestration_provider.webhook.lambda.artifact.s3.object_version, null)
  lambda_runtime                                                 = each.value.lambda.runtime
  lambda_architecture                                            = each.value.lambda.architecture
  lambda_zip                                                     = local.effective_config.orchestration_provider.webhook.lambda.artifact.zip
  lambda_scale_up_memory_size                                    = each.value.orchestration_provider.webhook.lambda.scale.up.memory_size
  lambda_event_source_mapping_batch_size                         = each.value.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.batch_size
  lambda_event_source_mapping_maximum_batching_window_in_seconds = each.value.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds
  lambda_timeout_scale_up                                        = each.value.orchestration_provider.webhook.lambda.scale.up.timeout
  lambda_scale_down_memory_size                                  = each.value.orchestration_provider.webhook.lambda.scale.down.memory_size
  lambda_timeout_scale_down                                      = each.value.orchestration_provider.webhook.lambda.scale.down.timeout
  lambda_subnet_ids                                              = each.value.lambda.subnet_ids
  lambda_security_group_ids                                      = each.value.lambda.security_group_ids
  lambda_tags                                                    = each.value.lambda.tags
  tracing_config                                                 = each.value.observability.tracing
  logging_retention_in_days                                      = each.value.observability.logs.retention_in_days
  logging_kms_key_id                                             = each.value.observability.logs.kms_key_id
  log_class                                                      = each.value.observability.logs.class
  enable_cloudwatch_agent                                        = each.value.compute_provider.aws.ec2.cloudwatch_agent.enabled
  cloudwatch_config                                              = each.value.compute_provider.aws.ec2.cloudwatch_agent.config
  runner_log_files                                               = each.value.compute_provider.aws.ec2.log_files
  runner_group_name                                              = each.value.runner.group_name
  runner_name_prefix                                             = each.value.runner.name_prefix
  parameter_store_tags                                           = each.value.ssm.parameters.tags

  scale_up_reserved_concurrent_executions = each.value.orchestration_provider.webhook.lambda.scale.up.reserved_concurrent_executions

  instance_profile_path     = each.value.compute_provider.aws.ec2.instance_profile_path
  role_path                 = each.value.runner.iam.path
  role_permissions_boundary = each.value.runner.iam.permissions_boundary

  enable_userdata                = each.value.compute_provider.aws.ec2.user_data.enabled
  userdata_template              = each.value.compute_provider.aws.ec2.user_data.template
  userdata_content               = each.value.compute_provider.aws.ec2.user_data.content
  userdata_pre_install           = each.value.compute_provider.aws.ec2.user_data.pre_install
  userdata_post_install          = each.value.compute_provider.aws.ec2.user_data.post_install
  enable_user_data_debug_logging = each.value.compute_provider.aws.ec2.user_data.debug_logging_enabled
  runner_hook_job_started        = each.value.runner.hooks.job_started
  runner_hook_job_completed      = each.value.runner.hooks.job_completed
  key_name                       = each.value.compute_provider.aws.ec2.key_name
  runner_ec2_tags                = each.value.compute_provider.aws.ec2.tags

  create_service_linked_role_spot = each.value.compute_provider.aws.ec2.create_service_linked_role_spot

  runner_iam_role_managed_policy_arns = values(each.value.runner.iam.managed_policy_arns)
  iam_overrides = {
    override_instance_profile = each.value.compute_provider.aws.ec2.instance_profile != null
    instance_profile_name     = try(each.value.compute_provider.aws.ec2.instance_profile.name, null)
    override_runner_role      = each.value.runner.iam.role != null
    runner_role_arn           = try(each.value.runner.iam.role.arn, null)
  }

  ghes_url        = local.effective_config.github.enterprise_server.url
  ghes_ssl_verify = local.effective_config.github.enterprise_server.ssl_verify
  user_agent      = local.effective_config.github.user_agent

  kms_key_arn = local.effective_config.ssm.kms_key_id

  log_level = each.value.observability.logs.level

  pool_config                                = each.value.orchestration_provider.webhook.lambda.pool.config
  pool_lambda_memory_size                    = each.value.orchestration_provider.webhook.lambda.pool.memory_size
  pool_lambda_timeout                        = each.value.orchestration_provider.webhook.lambda.pool.timeout
  pool_runner_owner                          = each.value.orchestration_provider.webhook.lambda.pool.runner_owner
  pool_lambda_reserved_concurrent_executions = each.value.orchestration_provider.webhook.lambda.pool.reserved_concurrent_executions
  pool_include_busy_runners                  = each.value.orchestration_provider.webhook.lambda.pool.include_busy_runners
  associate_public_ipv4_address              = each.value.compute_provider.aws.ec2.associate_public_ipv4_address

  ssm_housekeeper = {
    schedule_expression = each.value.ssm.housekeeper.schedule_expression
    state               = each.value.ssm.housekeeper.state
    artifact = {
      zip               = each.value.ssm.housekeeper.lambda.artifact.zip
      s3_bucket         = try(local.effective_config.lambda.artifact.s3.bucket, null)
      s3_key            = try(each.value.ssm.housekeeper.lambda.artifact.s3.key, null)
      s3_object_version = try(each.value.ssm.housekeeper.lambda.artifact.s3.object_version, null)
    }
    lambda_memory_size = each.value.ssm.housekeeper.lambda.memory_size
    lambda_timeout     = each.value.ssm.housekeeper.lambda.timeout
    config             = each.value.ssm.housekeeper.config
  }

  job_retry = {
    enable                                = each.value.orchestration_provider.webhook.job_retry.enabled
    delay_in_seconds                      = each.value.orchestration_provider.webhook.job_retry.delay_in_seconds
    delay_backoff                         = each.value.orchestration_provider.webhook.job_retry.delay_backoff
    lambda_memory_size                    = each.value.orchestration_provider.webhook.job_retry.lambda.memory_size
    lambda_reserved_concurrent_executions = each.value.orchestration_provider.webhook.job_retry.lambda.reserved_concurrent_executions
    lambda_timeout                        = each.value.orchestration_provider.webhook.job_retry.lambda.timeout
    max_attempts                          = each.value.orchestration_provider.webhook.job_retry.max_attempts
  }

  metrics = {
    enable    = each.value.observability.metrics.enabled
    namespace = each.value.observability.metrics.namespace
    metric = {
      enable_github_app_rate_limit    = each.value.observability.metrics.metric.github_app_rate_limit.enabled
      enable_job_retry                = each.value.observability.metrics.metric.job_retry.enabled
      enable_spot_termination_warning = each.value.observability.metrics.metric.spot_termination_warning.enabled
    }
  }
}
