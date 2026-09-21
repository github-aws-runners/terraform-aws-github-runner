
module "ami_housekeeper" {
  count  = try(local.effective_config.compute_provider.aws.ec2.ami.housekeeper.enabled, false) ? 1 : 0
  source = "../ami-housekeeper"

  prefix        = var.prefix
  tags          = local.tags
  aws_partition = var.aws_partition

  lambda_zip               = try(local.effective_config.compute_provider.aws.ec2.ami.housekeeper.artifact.zip, null)
  lambda_s3_bucket         = try(local.effective_config.lambda.artifact.s3.bucket, null)
  lambda_s3_key            = try(local.effective_config.compute_provider.aws.ec2.ami.housekeeper.artifact.s3.key, null)
  lambda_s3_object_version = try(local.effective_config.compute_provider.aws.ec2.ami.housekeeper.artifact.s3.object_version, null)

  lambda_architecture       = local.effective_config.lambda.architecture
  lambda_principals         = local.effective_config.lambda.principals
  lambda_runtime            = local.effective_config.lambda.runtime
  lambda_security_group_ids = local.effective_config.lambda.security_group_ids
  lambda_subnet_ids         = local.effective_config.lambda.subnet_ids
  lambda_memory_size        = local.effective_config.compute_provider.aws.ec2.ami.housekeeper.lambda.memory_size
  lambda_timeout            = local.effective_config.compute_provider.aws.ec2.ami.housekeeper.lambda.timeout
  lambda_tags               = local.effective_config.lambda.tags
  tracing_config            = local.effective_config.observability.tracing

  logging_retention_in_days = local.effective_config.observability.logs.retention_in_days
  logging_kms_key_id        = local.effective_config.observability.logs.kms_key_id
  log_class                 = local.effective_config.observability.logs.class
  log_level                 = local.effective_config.observability.logs.level

  role_path                 = local.effective_config.roles.path
  role_permissions_boundary = local.effective_config.roles.permissions_boundary

  cleanup_config             = local.effective_config.compute_provider.aws.ec2.ami.housekeeper.cleanup_config
  lambda_schedule_expression = local.effective_config.compute_provider.aws.ec2.ami.housekeeper.schedule.expression
}
