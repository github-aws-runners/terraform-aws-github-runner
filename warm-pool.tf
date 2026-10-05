module "warm_pool_stop_events" {
  source = "./modules/warm-pool-stop-events"
  count  = var.warm_pool.enabled ? 1 : 0

  config = {
    prefix       = var.prefix
    tags         = local.tags
    index_tables = { (var.prefix) = module.runners.warm_pool_index_table }
    lambda = {
      aws_partition             = var.aws_partition
      architecture              = var.lambda_architecture
      lambda_tags               = var.lambda_tags
      log_level                 = var.log_level
      log_class                 = var.log_class
      logging_kms_key_id        = var.logging_kms_key_id
      logging_retention_in_days = var.logging_retention_in_days
      principals                = var.lambda_principals
      role_path                 = var.role_path
      role_permissions_boundary = var.role_permissions_boundary
      runtime                   = var.lambda_runtime
      s3_bucket                 = var.lambda_s3_bucket
      s3_key                    = var.runners_lambda_s3_key
      s3_object_version         = var.runners_lambda_s3_object_version
      security_group_ids        = var.lambda_security_group_ids
      subnet_ids                = var.lambda_subnet_ids
      tracing_config            = var.tracing_config
      zip                       = var.runners_lambda_zip
    }
  }
}
