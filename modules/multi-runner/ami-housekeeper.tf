
module "ami_housekeeper" {
  count  = var.enable_ami_housekeeper ? 1 : 0
  source = "../ami-housekeeper"

  prefix        = var.prefix
  tags          = local.tags
  aws_partition = var.aws_partition

  lambda_zip               = var.ami_housekeeper_lambda_zip
  lambda_s3_bucket         = var.lambda_s3_bucket
  lambda_s3_key            = var.ami_housekeeper_lambda_s3_key
  lambda_s3_object_version = var.ami_housekeeper_lambda_s3_object_version

  lambda_architecture       = var.lambda_architecture
  lambda_principals         = var.lambda_principals
  lambda_runtime            = var.lambda_runtime
  lambda_security_group_ids = var.lambda_security_group_ids
  lambda_subnet_ids         = var.lambda_subnet_ids
  lambda_memory_size        = var.ami_housekeeper_lambda_memory_size
  lambda_timeout            = var.ami_housekeeper_lambda_timeout
  lambda_tags               = var.lambda_tags
  tracing_config            = var.tracing_config

  logging_retention_in_days = var.logging_retention_in_days
  logging_kms_key_id        = var.logging_kms_key_id
  log_level                 = var.log_level

  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary

  cleanup_config             = var.ami_housekeeper_cleanup_config
  lambda_schedule_expression = var.ami_housekeeper_lambda_schedule_expression
}
