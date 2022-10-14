module "runners" {
  source = "../runners"
  for_each = local.queues_by_runner_os
  aws_region    = var.aws_region
  aws_partition = var.aws_partition
  vpc_id        = var.vpc_id
  subnet_ids    = var.subnet_ids
  prefix        = var.prefix
  tags          = local.tags

  s3_runner_binaries = each.value["enable_runner_binaries_syncer"] ? {
    arn = module.runner_binaries[0].bucket.arn
    id  = module.runner_binaries[0].bucket.id
    key = module.runner_binaries[0].runner_distribution_object_key
  } : null

  runner_os                     = each.value["os-config"]["runner_os_type"]
  instance_types                = var.instance_types
  instance_target_capacity_type = var.instance_target_capacity_type
  instance_allocation_strategy  = var.instance_allocation_strategy
  instance_max_spot_price       = var.instance_max_spot_price
  block_device_mappings         = var.block_device_mappings

  runner_architecture = each.value["os-config"]["runner_architecture"]
  ami_filter          = var.ami_filter
  ami_owners          = var.ami_owners

  sqs_build_queue                      = each.value["arn"]
  github_app_parameters                = local.github_app_parameters
  enable_organization_runners          = var.enable_organization_runners
  enable_ephemeral_runners             = var.enable_ephemeral_runners
  enable_job_queued_check              = var.enable_job_queued_check
  disable_runner_autoupdate            = var.disable_runner_autoupdate
  enable_managed_runner_security_group = var.enable_managed_runner_security_group
  enable_runner_detailed_monitoring    = var.enable_runner_detailed_monitoring
  scale_down_schedule_expression       = var.scale_down_schedule_expression
  minimum_running_time_in_minutes      = var.minimum_running_time_in_minutes
  runner_boot_time_in_minutes          = var.runner_boot_time_in_minutes
  runner_extra_labels                  = var.runner_extra_labels
  runner_as_root                       = var.runner_as_root
  runner_run_as                        = var.runner_run_as
  runners_maximum_count                = var.runners_maximum_count
  idle_config                          = var.idle_config
  enable_ssm_on_runners                = var.enable_ssm_on_runners
  egress_rules                         = var.runner_egress_rules
  runner_additional_security_group_ids = var.runner_additional_security_group_ids
  metadata_options                     = var.runner_metadata_options

  enable_runner_binaries_syncer    = each.value["enable_runner_binaries_syncer"]
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
  logging_retention_in_days        = var.logging_retention_in_days
  logging_kms_key_id               = var.logging_kms_key_id
  enable_cloudwatch_agent          = var.enable_cloudwatch_agent
  cloudwatch_config                = var.cloudwatch_config
  runner_log_files                 = var.runner_log_files
  runner_group_name                = var.runner_group_name

  scale_up_reserved_concurrent_executions = var.scale_up_reserved_concurrent_executions

  instance_profile_path     = var.instance_profile_path
  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary

  enabled_userdata      = var.enabled_userdata
  userdata_template     = var.userdata_template
  userdata_pre_install  = var.userdata_pre_install
  userdata_post_install = var.userdata_post_install
  key_name              = var.key_name
  runner_ec2_tags       = var.runner_ec2_tags

  create_service_linked_role_spot = var.create_service_linked_role_spot

  runner_iam_role_managed_policy_arns = var.runner_iam_role_managed_policy_arns

  ghes_url        = var.ghes_url
  ghes_ssl_verify = var.ghes_ssl_verify

  kms_key_arn = var.kms_key_arn

  log_type  = var.log_type
  log_level = var.log_level

  pool_config                                = var.pool_config
  pool_lambda_timeout                        = var.pool_lambda_timeout
  pool_runner_owner                          = var.pool_runner_owner
  pool_lambda_reserved_concurrent_executions = var.pool_lambda_reserved_concurrent_executions
}