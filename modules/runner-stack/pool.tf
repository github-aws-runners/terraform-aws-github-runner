module "pool" {
  count = length(var.pool.config) == 0 ? 0 : 1

  source = "./pool"

  config = {
    prefix = var.prefix
    ghes = {
      ssl_verify = var.github.enterprise_server.ssl_verify
      url        = var.github.enterprise_server.url
    }
    user_agent            = var.github.user_agent
    github_app_parameters = var.github.app_parameters
    runners_maximum_count = var.runner.maximum_count
    kms_key_arn           = local.kms_key_arn
    lambda = {
      log_level                      = var.observability.log_level
      logging_retention_in_days      = var.observability.logs.retention_in_days
      logging_kms_key_id             = var.observability.logs.kms_key_id
      log_class                      = var.observability.logs.class
      reserved_concurrent_executions = var.pool.lambda.reserved_concurrent_executions
      s3_bucket                      = var.lambda.s3.bucket
      s3_key                         = var.lambda.s3.key
      s3_object_version              = var.lambda.s3.object_version
      security_group_ids             = var.lambda.security_group_ids
      subnet_ids                     = var.lambda.subnet_ids
      architecture                   = var.lambda.architecture
      memory_size                    = var.pool.lambda.memory_size
      runtime                        = var.lambda.runtime
      timeout                        = var.pool.lambda.timeout
      zip                            = local.lambda_zip
      parameter_store_tags           = local.parameter_store_tags
    }
    pool                      = var.pool.config
    include_busy_runners      = var.pool.include_busy_runners
    role_path                 = local.lambda_role_path
    role_permissions_boundary = var.lambda.role.permissions_boundary
    runner = {
      disable_runner_autoupdate = var.runner.auto_update_disabled
      ephemeral                 = var.runner.ephemeral
      enable_jit_config         = var.runner.jit_config_enabled
      labels                    = var.runner.labels
      group_name                = var.runner.group_name
      name_prefix               = var.runner.name_prefix
      pool_owner                = var.pool.runner_owner
    }
    ssm_token_path                 = "${var.ssm.paths.root}/${var.ssm.paths.tokens}"
    ssm_config_path                = "${var.ssm.paths.root}/${var.ssm.paths.config}"
    tags                           = local.tags
    lambda_tags                    = var.lambda.tags
    arn_ssm_parameters_path_config = local.arn_ssm_parameters_path_config
  }

  aws_partition  = var.aws_partition
  tracing_config = var.observability.tracing
  runner_provider = {
    type                   = local.provider.type
    environment_variables  = local.provider.pool.environment_variables
    iam_policy_json        = local.provider.pool.iam_policy_json
    managed_policy_enabled = local.provider.pool.managed_policy_enabled
    managed_policy_arn     = local.provider.pool.managed_policy_arn
  }
}
