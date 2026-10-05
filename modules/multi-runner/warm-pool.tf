locals {
  warm_pool_index_tables = merge(
    { for key, runner in module.runners : "${var.prefix}-${key}" => runner.warm_pool_index_table if runner.warm_pool_index_table != null },
    { for key, config in module.runner_configs : "${var.prefix}-${key}" => config.provider.aws.ec2.warm_pool_index_table if try(config.provider.aws.ec2.warm_pool_index_table, null) != null },
  )
  warm_pool_enabled = anytrue([
    for config in values(local.effective_config.multi_runner_config) : try(config.orchestration_provider.webhook.lambda.pool.warm.enabled, false)
  ])
}

module "warm_pool_stop_events" {
  source = "../warm-pool-stop-events"
  count  = local.warm_pool_enabled ? 1 : 0

  config = {
    prefix       = var.prefix
    tags         = local.tags
    index_tables = local.warm_pool_index_tables
    lambda = {
      aws_partition             = var.aws_partition
      architecture              = local.effective_config.lambda.architecture
      lambda_tags               = local.effective_config.lambda.tags
      log_level                 = local.effective_config.observability.logs.level
      log_class                 = local.effective_config.observability.logs.class
      logging_kms_key_id        = local.effective_config.observability.logs.kms_key_id
      logging_retention_in_days = local.effective_config.observability.logs.retention_in_days
      principals                = local.effective_config.lambda.principals
      role_path                 = local.effective_config.roles.path
      role_permissions_boundary = local.effective_config.roles.permissions_boundary
      runtime                   = local.effective_config.lambda.runtime
      s3_bucket                 = try(local.effective_config.lambda.artifact.s3.bucket, null)
      s3_key                    = try(local.effective_config.orchestration_provider.webhook.lambda.artifact.s3.key, null)
      s3_object_version         = try(local.effective_config.orchestration_provider.webhook.lambda.artifact.s3.object_version, null)
      security_group_ids        = local.effective_config.lambda.security_group_ids
      subnet_ids                = local.effective_config.lambda.subnet_ids
      tracing_config            = local.effective_config.observability.tracing
      zip                       = try(local.effective_config.orchestration_provider.webhook.lambda.artifact.zip, null)
    }
  }
}
