module "runners" {
  source   = "../.."
  for_each = var.lanes

  aws_region    = var.aws_region
  aws_partition = var.aws_partition
  vpc_id        = coalesce(each.value.provider.vpc_id, var.vpc_id)
  subnet_ids    = coalesce(each.value.provider.subnet_ids, var.subnet_ids)
  prefix        = "${var.prefix}-${each.key}"
  tags = merge(var.tags, {
    "ghr:environment" = "${var.prefix}-${each.key}"
  })

  s3_runner_binaries = each.value.provider.enable_runner_binaries_syncer ? var.runner_binaries["${each.value.runner.runner_os}_${each.value.runner.runner_architecture}"] : null

  ssm_paths = {
    root   = "${var.ssm_root_path}/${each.key}"
    tokens = "${var.ssm_paths.runners}/tokens"
    config = "${var.ssm_paths.runners}/config"
  }

  runner_os                     = each.value.runner.runner_os
  instance_types                = each.value.provider.instance_types
  instance_target_capacity_type = each.value.provider.instance_target_capacity_type
  instance_allocation_strategy  = each.value.provider.instance_allocation_strategy
  instance_type_priorities      = each.value.provider.instance_type_priorities
  instance_max_spot_price       = each.value.provider.instance_max_spot_price
  block_device_mappings         = each.value.provider.block_device_mappings

  runner_architecture = each.value.runner.runner_architecture
  ami                 = each.value.provider.ami

  sqs_build_queue                      = { "arn" : each.value.queue.arn, "url" : each.value.queue.url }
  github_app_parameters                = var.github_app_parameters
  ebs_optimized                        = each.value.provider.ebs_optimized
  enable_on_demand_failover_for_errors = each.value.provider.enable_on_demand_failover_for_errors
  scale_errors                         = each.value.provider.scale_errors
  enable_organization_runners          = each.value.runner.enable_organization_runners
  enable_ephemeral_runners             = each.value.runner.enable_ephemeral_runners
  enable_jit_config                    = each.value.runner.enable_jit_config
  enable_job_queued_check              = each.value.runner.enable_job_queued_check
  disable_runner_autoupdate            = each.value.runner.disable_runner_autoupdate
  enable_managed_runner_security_group = var.enable_managed_runner_security_group
  enable_runner_detailed_monitoring    = each.value.provider.enable_runner_detailed_monitoring
  scale_down_schedule_expression       = each.value.runner.scale_down_schedule_expression
  minimum_running_time_in_minutes      = each.value.runner.minimum_running_time_in_minutes
  runner_boot_time_in_minutes          = each.value.runner.runner_boot_time_in_minutes
  runner_disable_default_labels        = each.value.runner.runner_disable_default_labels
  runner_labels                        = each.value.runner.runner_disable_default_labels ? sort(distinct(each.value.runner.runner_extra_labels)) : sort(distinct(concat(["self-hosted", each.value.runner.runner_os, each.value.runner.runner_architecture], each.value.runner.runner_extra_labels)))
  runner_as_root                       = each.value.runner.runner_as_root
  runner_run_as                        = each.value.runner.runner_run_as
  runners_maximum_count                = each.value.runner.runners_maximum_count
  idle_config                          = each.value.provider.idle_config
  enable_ssm_on_runners                = each.value.provider.enable_ssm_on_runners
  egress_rules                         = var.runner_egress_rules
  runner_additional_security_group_ids = try(coalescelist(each.value.provider.runner_additional_security_group_ids, var.runner_additional_security_group_ids), [])
  metadata_options                     = each.value.provider.runner_metadata_options
  credit_specification                 = each.value.provider.credit_specification
  cpu_options                          = each.value.provider.cpu_options
  placement                            = each.value.provider.placement
  license_specifications               = each.value.provider.license_specifications
  use_dedicated_host                   = each.value.provider.use_dedicated_host

  enable_runner_binaries_syncer                                  = each.value.provider.enable_runner_binaries_syncer
  lambda_s3_bucket                                               = var.lambda_s3_bucket
  runners_lambda_s3_key                                          = var.runners_lambda_s3_key
  runners_lambda_s3_object_version                               = var.runners_lambda_s3_object_version
  lambda_runtime                                                 = var.lambda_runtime
  lambda_architecture                                            = var.lambda_architecture
  lambda_zip                                                     = var.runners_lambda_zip
  lambda_scale_up_memory_size                                    = var.scale_up_lambda_memory_size
  lambda_event_source_mapping_batch_size                         = coalesce(each.value.queue.lambda_event_source_mapping_batch_size, var.lambda_event_source_mapping_batch_size)
  lambda_event_source_mapping_maximum_batching_window_in_seconds = coalesce(each.value.queue.lambda_event_source_mapping_maximum_batching_window_in_seconds, var.lambda_event_source_mapping_maximum_batching_window_in_seconds)
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
  enable_cloudwatch_agent                                        = each.value.provider.enable_cloudwatch_agent
  cloudwatch_config                                              = try(coalesce(each.value.provider.cloudwatch_config, var.cloudwatch_config), null)
  runner_log_files                                               = each.value.provider.runner_log_files
  runner_group_name                                              = each.value.runner.runner_group_name
  runner_name_prefix                                             = each.value.runner.runner_name_prefix
  parameter_store_tags                                           = var.parameter_store_tags

  scale_up_reserved_concurrent_executions = each.value.runner.scale_up_reserved_concurrent_executions

  instance_profile_path     = var.instance_profile_path
  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary

  enable_userdata           = each.value.provider.enable_userdata
  userdata_template         = each.value.provider.userdata_template
  userdata_content          = each.value.provider.userdata_content
  userdata_pre_install      = each.value.provider.userdata_pre_install
  userdata_post_install     = each.value.provider.userdata_post_install
  runner_hook_job_started   = each.value.provider.runner_hook_job_started
  runner_hook_job_completed = each.value.provider.runner_hook_job_completed
  key_name                  = var.key_name
  runner_ec2_tags           = each.value.provider.runner_ec2_tags

  create_service_linked_role_spot = each.value.provider.create_service_linked_role_spot

  runner_iam_role_managed_policy_arns = each.value.runner.runner_iam_role_managed_policy_arns
  iam_overrides                       = each.value.runner.iam_overrides

  ghes_url        = var.ghes_url
  ghes_ssl_verify = var.ghes_ssl_verify
  user_agent      = var.user_agent

  kms_key_arn = var.kms_key_arn

  log_level = var.log_level

  pool_config                                = each.value.runner.pool_config
  pool_lambda_timeout                        = var.pool_lambda_timeout
  pool_runner_owner                          = each.value.runner.pool_runner_owner
  pool_lambda_reserved_concurrent_executions = var.pool_lambda_reserved_concurrent_executions
  associate_public_ipv4_address              = var.associate_public_ipv4_address

  ssm_housekeeper = var.runners_ssm_housekeeper

  job_retry = each.value.runner.job_retry

  metrics = var.metrics
}
