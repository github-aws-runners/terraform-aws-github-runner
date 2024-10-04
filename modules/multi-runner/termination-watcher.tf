locals {
  lambda_instance_termination_watcher = {
    prefix                    = var.prefix
    tags                      = local.tags
    aws_partition             = var.aws_partition
    architecture              = var.lambda_architecture
    principals                = var.lambda_principals
    runtime                   = var.lambda_runtime
    security_group_ids        = var.lambda_security_group_ids
    subnet_ids                = var.lambda_subnet_ids
    log_level                 = var.log_level
    logging_kms_key_id        = var.logging_kms_key_id
    logging_retention_in_days = var.logging_retention_in_days
    role_path                 = var.role_path
    role_permissions_boundary = var.role_permissions_boundary
    s3_bucket                 = var.lambda_s3_bucket
    tracing_config            = var.tracing_config
    lambda_tags               = var.lambda_tags
    metrics                   = var.metrics
  }
}

module "instance_termination_watcher" {
  source = "../termination-watcher"
  count  = var.instance_termination_watcher.enable ? 1 : 0

  config = merge(local.lambda_instance_termination_watcher, var.instance_termination_watcher)
}
