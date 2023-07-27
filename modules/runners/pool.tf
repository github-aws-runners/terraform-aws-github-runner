module "pool" {
  count = length(var.pool_config) == 0 ? 0 : 1

  source = "./pool"

  config = {
    prefix = var.prefix
    ghes = {
      ssl_verify = var.ghes_ssl_verify
      url        = var.ghes_url
    }
    github_app_parameters         = var.github_app_parameters
    instance_allocation_strategy  = var.instance_allocation_strategy
    instance_max_spot_price       = var.instance_max_spot_price
    instance_target_capacity_type = var.instance_target_capacity_type
    instance_types                = var.instance_types
    kms_key_arn                   = local.kms_key_arn
    ami_kms_key_arn               = local.ami_kms_key_arn
    lambda = {
      log_level                      = var.log_level
      logging_retention_in_days      = var.logging_retention_in_days
      logging_kms_key_id             = var.logging_kms_key_id
      reserved_concurrent_executions = var.pool_lambda_reserved_concurrent_executions
      s3_bucket                      = var.lambda_s3_bucket
      s3_key                         = var.runners_lambda_s3_key
      s3_object_version              = var.runners_lambda_s3_object_version
      security_group_ids             = var.lambda_security_group_ids
      subnet_ids                     = var.lambda_subnet_ids
      architecture                   = var.lambda_architecture
      runtime                        = var.lambda_runtime
      timeout                        = var.pool_lambda_timeout
      zip                            = local.lambda_zip
    }
    pool                      = var.pool_config
    role_path                 = local.role_path
    role_permissions_boundary = var.role_permissions_boundary
    runner = {
      disable_runner_autoupdate = var.disable_runner_autoupdate
      ephemeral                 = var.enable_ephemeral_runners
      enable_jit_config         = var.enable_jit_config
      boot_time_in_minutes      = var.runner_boot_time_in_minutes
      labels                    = var.runner_labels
      launch_template           = aws_launch_template.runner
      group_name                = var.runner_group_name
      name_prefix               = var.runner_name_prefix
      pool_owner                = var.pool_runner_owner
      role                      = aws_iam_role.runner
    }
    subnet_ids                           = var.subnet_ids
    ssm_token_path                       = "${var.ssm_paths.root}/${var.ssm_paths.tokens}"
    ssm_config_path                      = "${var.ssm_paths.root}/${var.ssm_paths.config}"
    ami_id_ssm_parameter_name            = var.ami_id_ssm_parameter_name
    ami_id_ssm_parameter_read_policy_arn = var.ami_id_ssm_parameter_name != null ? aws_iam_policy.ami_id_ssm_parameter_read[0].arn : null
    tags                                 = local.tags
    arn_ssm_parameters_path_config       = local.arn_ssm_parameters_path_config
  }

  aws_partition       = var.aws_partition
  lambda_tracing_mode = var.lambda_tracing_mode

}
