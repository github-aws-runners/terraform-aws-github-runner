module "runners" {
  source        = "../runners"
  for_each      = local.runner_config
  aws_region    = var.aws_region
  aws_partition = var.aws_partition
  vpc_id        = var.vpc_id
  subnet_ids    = var.subnet_ids
  prefix        = "${var.prefix}-${each.key}"
  tags = merge(local.tags, {
    "ghr:environment" = "${var.prefix}-${each.key}"
  })

  s3_runner_binaries = each.value.runner_config.enable_runner_binaries_syncer ? local.runner_binaries_by_os_and_arch_map["${each.value.runner_config.runner_os}_${each.value.runner_config.runner_architecture}"] : null

  ssm_paths = {
    root   = "${local.ssm_root_path}/${each.key}"
    tokens = "${var.ssm_paths.runners}/tokens"
    config = "${var.ssm_paths.runners}/config"
  }

  runner_os                     = each.value.runner_config.runner_os
  instance_types                = each.value.runner_config.instance_types
  instance_target_capacity_type = each.value.runner_config.instance_target_capacity_type
  instance_allocation_strategy  = each.value.runner_config.instance_allocation_strategy
  instance_max_spot_price       = each.value.runner_config.instance_max_spot_price
  block_device_mappings         = each.value.runner_config.block_device_mappings

  runner_architecture       = each.value.runner_config.runner_architecture
  ami_filter                = each.value.runner_config.ami_filter
  ami_owners                = each.value.runner_config.ami_owners
  ami_id_ssm_parameter_name = each.value.runner_config.ami_id_ssm_parameter_name
  ami_kms_key_arn           = each.value.runner_config.ami_kms_key_arn

  sqs_build_queue                      = { "arn" : each.value.arn }
  github_app_parameters                = local.github_app_parameters
  enable_organization_runners          = each.value.runner_config.enable_organization_runners
  enable_ephemeral_runners             = each.value.runner_config.enable_ephemeral_runners
  enable_jit_config                    = each.value.runner_config.enable_jit_config
  enable_job_queued_check              = each.value.runner_config.enable_job_queued_check
  disable_runner_autoupdate            = each.value.runner_config.disable_runner_autoupdate
  enable_managed_runner_security_group = var.enable_managed_runner_security_group
  enable_runner_detailed_monitoring    = each.value.runner_config.enable_runner_detailed_monitoring
  scale_down_schedule_expression       = each.value.runner_config.scale_down_schedule_expression
  minimum_running_time_in_minutes      = each.value.runner_config.minimum_running_time_in_minutes
  runner_boot_time_in_minutes          = each.value.runner_config.runner_boot_time_in_minutes
  runner_labels                        = "self-hosted,${each.value.runner_config.runner_os},${each.value.runner_config.runner_architecture},${each.value.runner_config.runner_extra_labels}"
  runner_as_root                       = each.value.runner_config.runner_as_root
  runner_run_as                        = each.value.runner_config.runner_run_as
  runners_maximum_count                = each.value.runner_config.runners_maximum_count
  idle_config                          = each.value.runner_config.idle_config
  enable_ssm_on_runners                = each.value.runner_config.enable_ssm_on_runners
  egress_rules                         = var.runner_egress_rules
  runner_additional_security_group_ids = try(coalescelist(each.value.runner_config.runner_additional_security_group_ids, var.runner_additional_security_group_ids), [])
  metadata_options                     = each.value.runner_config.runner_metadata_options
  credit_specification                 = each.value.runner_config.credit_specification

  enable_runner_binaries_syncer    = each.value.runner_config.enable_runner_binaries_syncer
  lambda_s3_bucket                 = var.lambda_s3_bucket
  runners_lambda_s3_key            = var.runners_lambda_s3_key
  runners_lambda_s3_object_version = var.runners_lambda_s3_object_version
  lambda_runtime                   = var.lambda_runtime
  lambda_architecture              = var.lambda_architecture
  lambda_zip                       = var.runners_lambda_zip
  lambda_timeout_scale_up          = var.runners_scale_up_lambda_timeout
  lambda_timeout_scale_down        = var.runners_scale_down_lambda_timeout
  lambda_subnet_ids                = var.lambda_subnet_ids
  lambda_security_group_ids        = var.lambda_security_group_ids
  lambda_tracing_mode              = var.lambda_tracing_mode
  logging_retention_in_days        = var.logging_retention_in_days
  logging_kms_key_id               = var.logging_kms_key_id
  enable_cloudwatch_agent          = each.value.runner_config.enable_cloudwatch_agent
  cloudwatch_config                = var.cloudwatch_config
  runner_log_files                 = each.value.runner_config.runner_log_files
  runner_group_name                = each.value.runner_config.runner_group_name
  runner_name_prefix               = each.value.runner_config.runner_name_prefix

  scale_up_reserved_concurrent_executions = each.value.runner_config.scale_up_reserved_concurrent_executions

  instance_profile_path     = var.instance_profile_path
  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary

  enable_userdata       = each.value.runner_config.enable_userdata
  userdata_template     = each.value.runner_config.userdata_template
  userdata_pre_install  = each.value.runner_config.userdata_pre_install
  userdata_post_install = each.value.runner_config.userdata_post_install
  key_name              = var.key_name
  runner_ec2_tags       = each.value.runner_config.runner_ec2_tags

  create_service_linked_role_spot = each.value.runner_config.create_service_linked_role_spot

  runner_iam_role_managed_policy_arns = each.value.runner_config.runner_iam_role_managed_policy_arns

  ghes_url        = var.ghes_url
  ghes_ssl_verify = var.ghes_ssl_verify

  kms_key_arn = var.kms_key_arn

  log_level = var.log_level

  pool_config                                = each.value.runner_config.pool_config
  pool_lambda_timeout                        = var.pool_lambda_timeout
  pool_runner_owner                          = each.value.runner_config.pool_runner_owner
  pool_lambda_reserved_concurrent_executions = var.pool_lambda_reserved_concurrent_executions
}
