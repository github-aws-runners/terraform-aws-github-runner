module "ec2" {
  source = "../runners/providers/ec2"

  lanes = {
    for lane_key, lane in local.runner_config_by_provider.ec2 : lane_key => {
      runner   = lane.runner
      provider = lane.provider.ec2
      queue = {
        arn                                                            = lane.arn
        url                                                            = lane.url
        lambda_event_source_mapping_batch_size                         = lane.queue.lambda_event_source_mapping_batch_size
        lambda_event_source_mapping_maximum_batching_window_in_seconds = lane.queue.lambda_event_source_mapping_maximum_batching_window_in_seconds
      }
    }
  }

  aws_region    = var.aws_region
  aws_partition = var.aws_partition
  vpc_id        = var.vpc_id
  subnet_ids    = var.subnet_ids
  prefix        = var.prefix
  tags          = local.tags

  runner_binaries       = local.runner_binaries_by_os_and_arch_map
  github_app_parameters = local.github_app_parameters
  ssm_root_path         = local.ssm_root_path
  ssm_paths             = var.ssm_paths

  enable_managed_runner_security_group = var.enable_managed_runner_security_group
  runner_egress_rules                  = var.runner_egress_rules
  runner_additional_security_group_ids = var.runner_additional_security_group_ids
  associate_public_ipv4_address        = var.associate_public_ipv4_address
  key_name                             = var.key_name

  lambda_s3_bucket                                               = var.lambda_s3_bucket
  runners_lambda_s3_key                                          = var.runners_lambda_s3_key
  runners_lambda_s3_object_version                               = var.runners_lambda_s3_object_version
  runners_lambda_zip                                             = var.runners_lambda_zip
  lambda_runtime                                                 = var.lambda_runtime
  lambda_architecture                                            = var.lambda_architecture
  scale_up_lambda_memory_size                                    = var.scale_up_lambda_memory_size
  runners_scale_up_lambda_timeout                                = var.runners_scale_up_lambda_timeout
  scale_down_lambda_memory_size                                  = var.scale_down_lambda_memory_size
  runners_scale_down_lambda_timeout                              = var.runners_scale_down_lambda_timeout
  lambda_event_source_mapping_batch_size                         = var.lambda_event_source_mapping_batch_size
  lambda_event_source_mapping_maximum_batching_window_in_seconds = var.lambda_event_source_mapping_maximum_batching_window_in_seconds
  lambda_subnet_ids                                              = var.lambda_subnet_ids
  lambda_security_group_ids                                      = var.lambda_security_group_ids
  lambda_tags                                                    = var.lambda_tags
  tracing_config                                                 = var.tracing_config

  logging_retention_in_days = var.logging_retention_in_days
  logging_kms_key_id        = var.logging_kms_key_id
  log_class                 = var.log_class
  log_level                 = var.log_level
  cloudwatch_config         = var.cloudwatch_config
  parameter_store_tags      = var.parameter_store_tags

  instance_profile_path     = var.instance_profile_path
  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary
  kms_key_arn               = var.kms_key_arn

  ghes_url        = var.ghes_url
  ghes_ssl_verify = var.ghes_ssl_verify
  user_agent      = var.user_agent

  pool_lambda_timeout                        = var.pool_lambda_timeout
  pool_lambda_reserved_concurrent_executions = var.pool_lambda_reserved_concurrent_executions
  runners_ssm_housekeeper                    = var.runners_ssm_housekeeper
  metrics                                    = var.metrics
}

# Keep every existing for_each lane in state while introducing the provider layer.
moved {
  from = module.runners
  to   = module.ec2.module.runners
}
