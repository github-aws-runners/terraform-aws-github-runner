
module "ami_housekeeper" {
  count  = try(local.translated_experimental.compute_provider.aws.ec2.ami.housekeeper.enabled, false) ? 1 : 0
  source = "../ami-housekeeper"

  prefix        = var.prefix
  tags          = merge(local.translated_experimental.tags, { "ghr:environment" = var.prefix })
  aws_partition = var.aws_partition

  lambda_zip               = local.translated_experimental.compute_provider.aws.ec2.ami.housekeeper.artifact.zip
  lambda_s3_bucket         = local.translated_experimental.compute_provider.aws.ec2.ami.housekeeper.artifact.s3 == null ? null : local.translated_experimental.lambda.artifact.s3.bucket
  lambda_s3_key            = try(local.translated_experimental.compute_provider.aws.ec2.ami.housekeeper.artifact.s3.key, null)
  lambda_s3_object_version = try(local.translated_experimental.compute_provider.aws.ec2.ami.housekeeper.artifact.s3.object_version, null)

  lambda_architecture       = local.translated_experimental.lambda.architecture
  lambda_principals         = local.translated_experimental.lambda.principals
  lambda_runtime            = local.translated_experimental.lambda.runtime
  lambda_security_group_ids = local.translated_experimental.lambda.security_group_ids
  lambda_subnet_ids         = local.translated_experimental.lambda.subnet_ids
  lambda_memory_size        = local.translated_experimental.compute_provider.aws.ec2.ami.housekeeper.lambda.memory_size
  lambda_timeout            = local.translated_experimental.compute_provider.aws.ec2.ami.housekeeper.lambda.timeout
  lambda_tags               = local.translated_experimental.lambda.tags
  tracing_config            = local.translated_experimental.observability.tracing

  logging_retention_in_days = local.translated_experimental.observability.logs.retention_in_days
  logging_kms_key_id        = local.translated_experimental.observability.logs.kms_key_id
  log_class                 = local.translated_experimental.observability.logs.class
  log_level                 = local.translated_experimental.observability.logs.level

  role_path                 = try(coalesce(local.translated_experimental.lambda.role.path, local.translated_experimental.roles.path), null)
  role_permissions_boundary = try(coalesce(local.translated_experimental.lambda.role.permissions_boundary, local.translated_experimental.roles.permissions_boundary), null)

  cleanup_config             = local.translated_experimental.compute_provider.aws.ec2.ami.housekeeper.cleanup_config
  lambda_schedule_expression = local.translated_experimental.compute_provider.aws.ec2.ami.housekeeper.schedule.expression
}
