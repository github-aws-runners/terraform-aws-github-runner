locals {
  # Derive binary targets from the resolved runner lanes before the binary
  # module is instantiated, so the effective configuration can consume the
  # binary outputs without depending on its own inputs.
  resolved_runner_binary_targets = distinct([
    for config in local.resolved_config.multi_runner_config : {
      os_type      = config.runner.os
      architecture = config.runner.architecture
    }
    if try(config.compute_provider.aws.ec2.binaries_syncer.enabled, false)
  ])

  resolved_runner_binary_targets_by_key = {
    for target in local.resolved_runner_binary_targets :
    "${target.os_type}_${target.architecture}" => target
  }
}

module "runner_binaries" {
  source   = "../runner-binaries-syncer"
  for_each = local.resolved_runner_binary_targets_by_key
  prefix   = "${var.prefix}-${each.value.os_type}-${each.value.architecture}"
  tags = merge(local.resolved_config.tags, {
    "ghr:environment" = var.prefix
  })

  # force mandatory lower case for s3 bucketname
  distribution_bucket_name = lower("${var.prefix}-${each.value.os_type}-${each.value.architecture}-dist-${random_string.random.result}")

  runner_os           = each.value.os_type
  runner_architecture = each.value.architecture

  lambda_s3_bucket                 = try(local.resolved_config.lambda.artifact.s3.bucket, null)
  syncer_lambda_s3_key             = try(local.resolved_config.compute_provider.aws.ec2.runner_binaries.syncer.artifact.s3.key, null)
  syncer_lambda_s3_object_version  = try(local.resolved_config.compute_provider.aws.ec2.runner_binaries.syncer.artifact.s3.object_version, null)
  lambda_runtime                   = local.resolved_config.lambda.runtime
  lambda_architecture              = local.resolved_config.lambda.architecture
  lambda_zip                       = local.resolved_config.compute_provider.aws.ec2.runner_binaries.syncer.artifact.zip
  lambda_memory_size               = local.resolved_config.compute_provider.aws.ec2.runner_binaries.syncer.lambda.memory_size
  lambda_timeout                   = local.resolved_config.compute_provider.aws.ec2.runner_binaries.syncer.lambda.timeout
  lambda_tags                      = local.resolved_config.lambda.tags
  tracing_config                   = local.resolved_config.observability.tracing
  logging_retention_in_days        = local.resolved_config.observability.logs.retention_in_days
  logging_kms_key_id               = local.resolved_config.observability.logs.kms_key_id
  log_class                        = local.resolved_config.observability.logs.class
  lambda_schedule_expression       = local.resolved_config.compute_provider.aws.ec2.runner_binaries.syncer.schedule.expression
  state_event_rule_binaries_syncer = local.resolved_config.compute_provider.aws.ec2.runner_binaries.syncer.schedule.state

  server_side_encryption_configuration = try(local.resolved_config.compute_provider.aws.ec2.runner_binaries.s3.encryption.enabled, false) ? {
    rule = {
      bucket_key_enabled = local.resolved_config.compute_provider.aws.ec2.runner_binaries.s3.encryption.bucket_key_enabled
      apply_server_side_encryption_by_default = {
        sse_algorithm     = local.resolved_config.compute_provider.aws.ec2.runner_binaries.s3.encryption.sse_algorithm
        kms_master_key_id = local.resolved_config.compute_provider.aws.ec2.runner_binaries.s3.encryption.kms_master_key_id
      }
    }
  } : null
  s3_tags       = local.resolved_config.compute_provider.aws.ec2.runner_binaries.s3.tags
  s3_versioning = local.resolved_config.compute_provider.aws.ec2.runner_binaries.s3.versioning

  role_path                 = local.resolved_config.roles.path
  role_permissions_boundary = local.resolved_config.roles.permissions_boundary

  log_level = local.resolved_config.observability.logs.level

  lambda_subnet_ids         = local.resolved_config.lambda.subnet_ids
  lambda_security_group_ids = local.resolved_config.lambda.security_group_ids
  aws_partition             = var.aws_partition

  lambda_principals = local.resolved_config.lambda.principals
}
locals {
  runner_binaries_by_os_and_arch_map = {
    for k, v in module.runner_binaries : k => { arn = v.bucket.arn, id = v.bucket.id, key = v.runner_distribution_object_key }
  }
}
