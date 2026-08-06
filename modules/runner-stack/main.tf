locals {
  tags = merge(
    {
      "Name" = format("%s-action-runner", var.prefix)
    },
    {
      "ghr:ssm_config_path" = "${var.ssm_paths.root}/${var.ssm_paths.config}"
    },
    var.tags,
  )

  role_path                      = var.role_path == null ? "/${var.prefix}/" : var.role_path
  lambda_zip                     = var.lambda_zip == null ? "${path.module}/../../lambdas/functions/control-plane/runners.zip" : var.lambda_zip
  kms_key_arn                    = var.kms_key_arn != null ? var.kms_key_arn : ""
  enable_job_queued_check        = var.enable_job_queued_check == null ? !var.enable_ephemeral_runners : var.enable_job_queued_check
  token_path                     = "${var.ssm_paths.root}/${var.ssm_paths.tokens}"
  arn_ssm_parameters_path_config = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_paths.root}/${var.ssm_paths.config}"
  provider_type                  = lower(trimspace(var.provider_type))

  provider = one(module.ec2[*].control_plane)
}

data "aws_caller_identity" "current" {}

module "ec2" {
  count  = local.provider_type == "ec2" ? 1 : 0
  source = "../compute-providers/ec2"

  ami                                  = var.ami
  aws_region                           = var.aws_region
  vpc_id                               = var.vpc_id
  subnet_ids                           = var.subnet_ids
  overrides                            = var.overrides
  iam_overrides                        = var.iam_overrides
  tags                                 = var.tags
  prefix                               = var.prefix
  s3_runner_binaries                   = var.s3_runner_binaries
  block_device_mappings                = var.block_device_mappings
  ebs_optimized                        = var.ebs_optimized
  instance_target_capacity_type        = var.instance_target_capacity_type
  instance_allocation_strategy         = var.instance_allocation_strategy
  instance_type_priorities             = var.instance_type_priorities
  instance_max_spot_price              = var.instance_max_spot_price
  runner_os                            = var.runner_os
  instance_types                       = var.instance_types
  enable_userdata                      = var.enable_userdata
  userdata_template                    = var.userdata_template
  userdata_content                     = var.userdata_content
  userdata_pre_install                 = var.userdata_pre_install
  userdata_post_install                = var.userdata_post_install
  runner_hook_job_started              = var.runner_hook_job_started
  runner_hook_job_completed            = var.runner_hook_job_completed
  runner_boot_time_in_minutes          = var.runner_boot_time_in_minutes
  role_permissions_boundary            = var.role_permissions_boundary
  role_path                            = var.role_path
  instance_profile_path                = var.instance_profile_path
  runner_as_root                       = var.runner_as_root
  runner_run_as                        = var.runner_run_as
  runner_architecture                  = var.runner_architecture
  logging_retention_in_days            = var.logging_retention_in_days
  logging_kms_key_id                   = var.logging_kms_key_id
  enable_ssm_on_runners                = var.enable_ssm_on_runners
  create_service_linked_role_spot      = var.create_service_linked_role_spot
  aws_partition                        = var.aws_partition
  runner_iam_role_managed_policy_arns  = var.runner_iam_role_managed_policy_arns
  enable_cloudwatch_agent              = var.enable_cloudwatch_agent
  enable_managed_runner_security_group = var.enable_managed_runner_security_group
  cloudwatch_config                    = var.cloudwatch_config
  runner_log_files                     = var.runner_log_files
  ghes_url                             = var.ghes_url
  ghes_ssl_verify                      = var.ghes_ssl_verify
  key_name                             = var.key_name
  runner_additional_security_group_ids = var.runner_additional_security_group_ids
  enable_runner_detailed_monitoring    = var.enable_runner_detailed_monitoring
  egress_rules                         = var.egress_rules
  runner_ec2_tags                      = var.runner_ec2_tags
  metadata_options                     = var.metadata_options
  enable_runner_binaries_syncer        = var.enable_runner_binaries_syncer
  enable_user_data_debug_logging       = var.enable_user_data_debug_logging
  ssm_paths                            = var.ssm_paths
  runner_name_prefix                   = var.runner_name_prefix
  tracing_config                       = var.tracing_config
  credit_specification                 = var.credit_specification
  cpu_options                          = var.cpu_options
  placement                            = var.placement
  license_specifications               = var.license_specifications
  associate_public_ipv4_address        = var.associate_public_ipv4_address
  enable_on_demand_failover_for_errors = var.enable_on_demand_failover_for_errors
  scale_errors                         = var.scale_errors
  use_dedicated_host                   = var.use_dedicated_host
}
