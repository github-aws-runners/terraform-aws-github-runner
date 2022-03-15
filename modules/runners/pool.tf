module "pool" {
  count = length(var.pool_config) == 0 ? 0 : 1

  source = "./pool"

  config = {
    environment = var.environment
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
    lambda = {
      log_level                      = var.log_level
      log_type                       = var.log_type
      logging_retention_in_days      = var.logging_retention_in_days
      logging_kms_key_id             = var.logging_kms_key_id
      reserved_concurrent_executions = var.pool_lambda_reserved_concurrent_executions
      s3_bucket                      = var.lambda_s3_bucket
      s3_key                         = var.runners_lambda_s3_key
      s3_object_version              = var.runners_lambda_s3_object_version
      security_group_ids             = var.lambda_security_group_ids
      subnet_ids                     = var.lambda_subnet_ids
      timeout                        = var.pool_lambda_timeout
      zip                            = local.lambda_zip
    }
    pool                      = var.pool_config
    role_path                 = local.role_path
    role_permissions_boundary = var.role_permissions_boundary
    runner = {
      disable_runner_autoupdate = var.disable_runner_autoupdate
      ephemeral                 = var.enable_ephemeral_runners
      extra_labels              = var.runner_extra_labels
      launch_template           = aws_launch_template.runner
      group_name                = var.runner_group_name
      pool_owner                = var.pool_runner_owner
      role                      = aws_iam_role.runner
    }
    subnet_ids = var.subnet_ids
    tags       = local.tags
  }

  aws_partition = var.aws_partition

}
