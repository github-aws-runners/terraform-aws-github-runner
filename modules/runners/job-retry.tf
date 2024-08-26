
locals {
  job_retry_enabled = var.job_retry != null && var.job_retry.enable ? true : false

  job_retry = {
    prefix                      = var.prefix
    tags                        = local.tags
    aws_partition               = var.aws_partition
    architecture                = var.lambda_architecture
    runtime                     = var.lambda_runtime
    security_group_ids          = var.lambda_security_group_ids
    subnet_ids                  = var.lambda_subnet_ids
    kms_key_arn                 = var.kms_key_arn
    lambda_tags                 = var.lambda_tags
    log_level                   = var.log_level
    logging_kms_key_id          = var.logging_kms_key_id
    logging_retention_in_days   = var.logging_retention_in_days
    metrics                     = var.metrics
    role_path                   = var.role_path
    role_permissions_boundary   = var.role_permissions_boundary
    s3_bucket                   = var.lambda_s3_bucket
    s3_key                      = var.runners_lambda_s3_key
    s3_object_version           = var.runners_lambda_s3_object_version
    zip                         = var.lambda_zip
    tracing_config              = var.tracing_config
    github_app_parameters       = var.github_app_parameters
    enable_organization_runners = var.enable_organization_runners
    sqs_build_queue             = var.sqs_build_queue
  }
}

module "job_retry" {
  source = "./job-retry"
  count  = local.job_retry_enabled ? 1 : 0

  config = local.job_retry
}
