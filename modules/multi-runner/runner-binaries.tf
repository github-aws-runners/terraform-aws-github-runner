module "runner_binaries" {
  source   = "../runner-binaries-syncer"
  for_each = local.unique_os_and_arch
  prefix   = "${var.prefix}-${each.value.os_type}-${each.value.architecture}"
  tags     = merge(local.translated_experimental_base.tags, { "ghr:environment" = var.prefix })

  # force mandatory lower case for s3 bucketname
  distribution_bucket_name = lower("${var.prefix}-${each.value.os_type}-${each.value.architecture}-dist-${random_string.random.result}")

  runner_os           = each.value.os_type
  runner_architecture = each.value.architecture

  lambda_s3_bucket                 = local.translated_experimental_base.compute_provider.ec2.runner_binaries.syncer.artifact.s3 == null ? null : local.translated_experimental_base.lambda.artifact.s3.bucket
  syncer_lambda_s3_key             = try(local.translated_experimental_base.compute_provider.ec2.runner_binaries.syncer.artifact.s3.key, null)
  syncer_lambda_s3_object_version  = try(local.translated_experimental_base.compute_provider.ec2.runner_binaries.syncer.artifact.s3.object_version, null)
  lambda_runtime                   = local.translated_experimental_base.lambda.runtime
  lambda_architecture              = local.translated_experimental_base.lambda.architecture
  lambda_zip                       = local.translated_experimental_base.compute_provider.ec2.runner_binaries.syncer.artifact.zip
  lambda_memory_size               = local.translated_experimental_base.compute_provider.ec2.runner_binaries.syncer.lambda.memory_size
  lambda_timeout                   = local.translated_experimental_base.compute_provider.ec2.runner_binaries.syncer.lambda.timeout
  lambda_tags                      = local.translated_experimental_base.lambda.tags
  tracing_config                   = local.translated_experimental_base.observability.tracing
  logging_retention_in_days        = local.translated_experimental_base.observability.logs.retention_in_days
  logging_kms_key_id               = local.translated_experimental_base.observability.logs.kms_key_id
  log_class                        = local.translated_experimental_base.observability.logs.class
  state_event_rule_binaries_syncer = local.translated_experimental_base.compute_provider.ec2.runner_binaries.syncer.schedule.state
  lambda_schedule_expression       = local.translated_experimental_base.compute_provider.ec2.runner_binaries.syncer.schedule.expression

  server_side_encryption_configuration = local.translated_experimental_base.compute_provider.ec2.runner_binaries.s3.encryption.enabled ? {
    rule = {
      bucket_key_enabled = local.translated_experimental_base.compute_provider.ec2.runner_binaries.s3.encryption.bucket_key_enabled
      apply_server_side_encryption_by_default = {
        sse_algorithm     = local.translated_experimental_base.compute_provider.ec2.runner_binaries.s3.encryption.sse_algorithm
        kms_master_key_id = local.translated_experimental_base.compute_provider.ec2.runner_binaries.s3.encryption.kms_master_key_id
      }
    }
  } : null
  s3_tags                  = local.translated_experimental_base.compute_provider.ec2.runner_binaries.s3.tags
  s3_versioning            = local.translated_experimental_base.compute_provider.ec2.runner_binaries.s3.versioning
  s3_logging_bucket        = local.translated_experimental_base.compute_provider.ec2.runner_binaries.s3.logging.bucket
  s3_logging_bucket_prefix = local.translated_experimental_base.compute_provider.ec2.runner_binaries.s3.logging.prefix

  role_path                 = try(coalesce(local.translated_experimental_base.lambda.role.path, local.translated_experimental_base.roles.path), null)
  role_permissions_boundary = try(coalesce(local.translated_experimental_base.lambda.role.permissions_boundary, local.translated_experimental_base.roles.permissions_boundary), null)

  log_level = local.translated_experimental_base.observability.logs.level

  lambda_subnet_ids         = local.translated_experimental_base.lambda.subnet_ids
  lambda_security_group_ids = local.translated_experimental_base.lambda.security_group_ids
  aws_partition             = var.aws_partition

  lambda_principals = local.translated_experimental_base.lambda.principals
}

locals {
  runner_binaries_by_os_and_arch_map = {
    for k, v in module.runner_binaries : k => { arn = v.bucket.arn, id = v.bucket.id, key = v.runner_distribution_object_key }
  }
}
