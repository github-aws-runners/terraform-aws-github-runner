locals {
  # Windows Runners can take their sweet time to do anything
  min_runtime_defaults = {
    "windows" = 15
    "linux"   = 5
  }

  scale_down_environment_config = {
    environment                     = var.prefix
    idle_config                     = var.idle_config
    minimum_running_time_in_minutes = coalesce(var.minimum_running_time_in_minutes, local.min_runtime_defaults[var.runner_os])
    runner_boot_time_in_minutes     = var.runner_boot_time_in_minutes
  }
}

module "scale_down" {
  count  = var.scale_down_schedule_expression != null ? 1 : 0
  source = "./scale-down"

  environments        = [local.scale_down_environment_config]
  prefix              = var.prefix
  schedule_expression = var.scale_down_schedule_expression

  github_app_parameters            = var.github_app_parameters
  lambda_s3_bucket                 = var.lambda_s3_bucket
  runners_lambda_s3_key            = var.runners_lambda_s3_key
  runners_lambda_s3_object_version = var.runners_lambda_s3_object_version
  lambda_runtime                   = var.lambda_runtime
  lambda_timeout                   = var.lambda_timeout_scale_down
  lambda_memory_size               = var.lambda_scale_down_memory_size
  lambda_architecture              = var.lambda_architecture
  lambda_zip                       = local.lambda_zip
  lambda_subnet_ids                = var.lambda_subnet_ids
  lambda_security_group_ids        = var.lambda_security_group_ids
  lambda_tags                      = var.lambda_tags
  tracing_config                   = var.tracing_config
  logging_retention_in_days        = var.logging_retention_in_days
  logging_kms_key_id               = var.logging_kms_key_id
  kms_key_arn                      = local.kms_key_arn
  ghes_url                         = var.ghes_url
  ghes_ssl_verify                  = var.ghes_ssl_verify
  user_agent                       = var.user_agent
  log_level                        = var.log_level
  metrics                          = var.metrics
  role_path                        = local.role_path
  role_permissions_boundary        = var.role_permissions_boundary
  aws_partition                    = var.aws_partition
  tags                             = local.tags
}
