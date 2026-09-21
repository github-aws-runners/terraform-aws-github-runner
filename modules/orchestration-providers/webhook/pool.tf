module "pool" {
  count  = length(local.resolved_config.pool.config) > 0 ? 1 : 0
  source = "./pool"

  config = {
    prefix = local.resolved_config.prefix
    ghes = {
      ssl_verify = local.resolved_config.github.enterprise_server.ssl_verify
      url        = local.resolved_config.github.enterprise_server.url
    }
    user_agent            = local.resolved_config.github.user_agent
    github_app_parameters = local.resolved_config.github.app_parameters
    runners_maximum_count = local.resolved_config.runner.maximum_count
    kms_key_id            = local.resolved_config.ssm.kms_key_id
    lambda = {
      log_level                      = local.resolved_config.observability.logs.level
      logging_retention_in_days      = local.resolved_config.observability.logs.retention_in_days
      logging_kms_key_id             = local.resolved_config.observability.logs.kms_key_id
      log_class                      = local.resolved_config.observability.logs.class
      reserved_concurrent_executions = local.resolved_config.pool.reserved_concurrent_executions
      s3_bucket                      = local.resolved_config.lambda.artifact.s3.bucket
      s3_key                         = local.resolved_config.lambda.artifact.s3.key
      s3_object_version              = local.resolved_config.lambda.artifact.s3.object_version
      security_group_ids             = local.resolved_config.lambda.security_group_ids
      subnet_ids                     = local.resolved_config.lambda.subnet_ids
      architecture                   = local.resolved_config.lambda.architecture
      memory_size                    = local.resolved_config.pool.memory_size
      runtime                        = local.resolved_config.lambda.runtime
      timeout                        = local.resolved_config.pool.timeout
      zip                            = local.resolved_config.lambda.artifact.zip
      parameter_store_tags           = local.resolved_config.ssm.parameter_store_tags
      principals                     = local.resolved_config.lambda.role.principals
    }
    pool                      = local.resolved_config.pool.config
    include_busy_runners      = local.resolved_config.pool.include_busy_runners
    role_path                 = local.resolved_config.lambda.role.path
    role_permissions_boundary = local.resolved_config.lambda.role.permissions_boundary
    runner = {
      disable_runner_autoupdate = local.resolved_config.runner.auto_update_disabled
      ephemeral                 = local.resolved_config.runner.ephemeral
      enable_jit_config         = local.resolved_config.runner.jit_config_enabled
      labels                    = local.resolved_config.runner.labels
      group_name                = local.resolved_config.runner.group_name
      name_prefix               = local.resolved_config.runner.name_prefix
      pool_owner                = local.resolved_config.pool.runner_owner
      boot_time_in_minutes      = local.resolved_config.runner.boot_time_in_minutes
    }
    ssm_token_path                 = local.resolved_config.ssm.token_path
    ssm_token_path_arn             = local.resolved_config.ssm.token_path_arn
    ssm_config_path                = local.resolved_config.ssm.config_path
    tags                           = local.pool_tags
    lambda_tags                    = local.pool_lambda_tags
    log_group_tags                 = local.pool_log_tags
    arn_ssm_parameters_path_config = local.resolved_config.ssm.config_path_arn
  }

  aws_partition  = var.aws_partition
  tracing_config = local.resolved_config.observability.tracing
  runner_provider = {
    type                   = var.runner_provider.type
    environment_variables  = var.runner_provider.pool.environment_variables
    iam_policy_json        = var.runner_provider.pool.iam_policy_json
    managed_policy_enabled = var.runner_provider.pool.managed_policy_enabled
    managed_policy_arn     = var.runner_provider.pool.managed_policy_arn
  }
}
