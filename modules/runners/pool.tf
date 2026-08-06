module "pool" {
  count = length(var.pool_config) == 0 ? 0 : 1

  source = "./pool"

  config = {
    prefix = var.prefix
    ghes = {
      ssl_verify = var.ghes_ssl_verify
      url        = var.ghes_url
    }
    user_agent            = var.user_agent
    github_app_parameters = var.github_app_parameters
    runners_maximum_count = var.runners_maximum_count
    kms_key_arn           = local.kms_key_arn
    lambda = {
      log_level                      = var.log_level
      logging_retention_in_days      = var.logging_retention_in_days
      logging_kms_key_id             = var.logging_kms_key_id
      log_class                      = var.log_class
      reserved_concurrent_executions = var.pool_lambda_reserved_concurrent_executions
      s3_bucket                      = var.lambda_s3_bucket
      s3_key                         = var.runners_lambda_s3_key
      s3_object_version              = var.runners_lambda_s3_object_version
      security_group_ids             = var.lambda_security_group_ids
      subnet_ids                     = var.lambda_subnet_ids
      architecture                   = var.lambda_architecture
      memory_size                    = var.pool_lambda_memory_size
      runtime                        = var.lambda_runtime
      timeout                        = var.pool_lambda_timeout
      zip                            = local.lambda_zip
      parameter_store_tags           = local.parameter_store_tags
    }
    pool                      = var.pool_config
    include_busy_runners      = var.pool_include_busy_runners
    role_path                 = local.role_path
    role_permissions_boundary = var.role_permissions_boundary
    runner = {
      disable_runner_autoupdate = var.disable_runner_autoupdate
      ephemeral                 = var.enable_ephemeral_runners
      enable_jit_config         = var.enable_jit_config
      labels                    = var.runner_labels
      group_name                = var.runner_group_name
      name_prefix               = var.runner_name_prefix
      pool_owner                = var.pool_runner_owner
    }
    ssm_token_path                 = "${var.ssm_paths.root}/${var.ssm_paths.tokens}"
    ssm_config_path                = "${var.ssm_paths.root}/${var.ssm_paths.config}"
    tags                           = local.tags
    lambda_tags                    = var.lambda_tags
    arn_ssm_parameters_path_config = local.arn_ssm_parameters_path_config
  }

  aws_partition  = var.aws_partition
  tracing_config = var.tracing_config
  runner_provider = {
    type                   = local.provider.type
    environment_variables  = local.provider.pool.environment_variables
    iam_policy_json        = local.provider.pool.iam_policy_json
    managed_policy_enabled = local.provider.pool.managed_policy_enabled
    managed_policy_arn     = local.provider.pool.managed_policy_arn
  }
}
