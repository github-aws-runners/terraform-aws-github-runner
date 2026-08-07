locals {
  provider_type = lower(trimspace(var.compute_provider.type))
  ec2           = var.compute_provider.ec2
  provider      = one(module.ec2[*].control_plane)
}

module "ec2" {
  count  = local.provider_type == "ec2" ? 1 : 0
  source = "../compute-providers/ec2"

  ami        = local.ec2.ami
  aws_region = var.aws_region
  vpc_id     = local.ec2.vpc_id
  subnet_ids = local.ec2.subnet_ids
  overrides  = local.ec2.overrides
  iam_overrides = {
    override_instance_profile = local.ec2.instance_profile != null
    instance_profile_name     = try(local.ec2.instance_profile.name, null)
  }
  runner_role                          = local.runner_role
  tags                                 = var.tags
  prefix                               = var.prefix
  s3_runner_binaries                   = local.ec2.binaries_syncer.s3
  block_device_mappings                = local.ec2.block_device_mappings
  ebs_optimized                        = local.ec2.ebs_optimized
  instance_target_capacity_type        = local.ec2.instance_target_capacity_type
  instance_allocation_strategy         = local.ec2.instance_allocation_strategy
  instance_type_priorities             = local.ec2.instance_type_priorities
  instance_max_spot_price              = local.ec2.instance_max_spot_price
  runner_os                            = var.runner.os
  instance_types                       = local.ec2.instance_types
  enable_userdata                      = local.ec2.user_data.enabled
  userdata_template                    = local.ec2.user_data.template
  userdata_content                     = local.ec2.user_data.content
  userdata_pre_install                 = local.ec2.user_data.pre_install
  userdata_post_install                = local.ec2.user_data.post_install
  enable_user_data_debug_logging       = local.ec2.user_data.debug_logging_enabled
  runner_hook_job_started              = var.runner.hooks.job_started
  runner_hook_job_completed            = var.runner.hooks.job_completed
  runner_boot_time_in_minutes          = var.runner.boot_time_in_minutes
  role_path                            = var.runner.iam.path
  instance_profile_path                = local.ec2.instance_profile_path
  runner_as_root                       = var.runner.run_as_root
  runner_run_as                        = var.runner.run_as
  runner_architecture                  = var.runner.architecture
  logging_retention_in_days            = var.observability.logs.retention_in_days
  logging_kms_key_id                   = var.observability.logs.kms_key_id
  create_service_linked_role_spot      = local.ec2.create_service_linked_role_spot
  aws_partition                        = var.aws_partition
  enable_cloudwatch_agent              = local.ec2.cloudwatch_agent.enabled
  enable_managed_runner_security_group = local.ec2.managed_security_group_enabled
  cloudwatch_config                    = local.ec2.cloudwatch_agent.config
  runner_log_files                     = local.ec2.log_files
  ghes_url                             = var.github.enterprise_server.url
  ghes_ssl_verify                      = var.github.enterprise_server.ssl_verify
  key_name                             = local.ec2.key_name
  runner_additional_security_group_ids = local.ec2.additional_security_group_ids
  enable_runner_detailed_monitoring    = local.ec2.detailed_monitoring_enabled
  egress_rules                         = local.ec2.egress_rules
  runner_ec2_tags                      = local.ec2.tags
  metadata_options                     = local.ec2.metadata_options
  enable_runner_binaries_syncer        = local.ec2.binaries_syncer.enabled
  ssm_paths                            = var.ssm.paths
  runner_name_prefix                   = var.runner.name_prefix
  credit_specification                 = local.ec2.credit_specification
  cpu_options                          = local.ec2.cpu_options
  placement                            = local.ec2.placement
  license_specifications               = local.ec2.license_specifications
  associate_public_ipv4_address        = local.ec2.associate_public_ipv4_address
  enable_on_demand_failover_for_errors = local.ec2.enable_on_demand_failover_for_errors
  scale_errors                         = local.ec2.scale_errors
  use_dedicated_host                   = local.ec2.use_dedicated_host
}
