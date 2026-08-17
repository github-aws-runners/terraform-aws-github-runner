module "instance_termination_watcher" {
  source = "../termination-watcher"
  count  = try(local.translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.enabled, false) ? 1 : 0

  config = {
    prefix                       = var.prefix
    tags                         = merge(local.translated_experimental.tags, { "ghr:environment" = var.prefix })
    aws_partition                = var.aws_partition
    architecture                 = local.translated_experimental.lambda.architecture
    principals                   = local.translated_experimental.lambda.principals
    runtime                      = local.translated_experimental.lambda.runtime
    security_group_ids           = local.translated_experimental.lambda.security_group_ids
    subnet_ids                   = local.translated_experimental.lambda.subnet_ids
    log_level                    = local.translated_experimental.observability.logs.level
    log_class                    = local.translated_experimental.observability.logs.class
    logging_kms_key_id           = local.translated_experimental.observability.logs.kms_key_id
    logging_retention_in_days    = local.translated_experimental.observability.logs.retention_in_days
    role_path                    = try(coalesce(local.translated_experimental.lambda.role.path, local.translated_experimental.roles.path), null)
    role_permissions_boundary    = try(coalesce(local.translated_experimental.lambda.role.permissions_boundary, local.translated_experimental.roles.permissions_boundary), null)
    s3_bucket                    = local.translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.artifact.s3 == null ? null : local.translated_experimental.lambda.artifact.s3.bucket
    tracing_config               = local.translated_experimental.observability.tracing
    lambda_tags                  = local.translated_experimental.lambda.tags
    metrics                      = local.translated_experimental.observability.metrics
    features                     = local.translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.features
    memory_size                  = local.translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.lambda.memory_size
    timeout                      = local.translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.lambda.timeout
    zip                          = local.translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.artifact.zip
    s3_key                       = try(local.translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.artifact.s3.key, null)
    s3_object_version            = try(local.translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.artifact.s3.object_version, null)
    enable_runner_deregistration = local.translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.enable_runner_deregistration
    github_app_parameters = local.translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.enable_runner_deregistration ? {
      id         = local.github_app_parameters.id[0]
      key_base64 = local.github_app_parameters.key_base64[0]
    } : null
    ghes_url              = local.translated_experimental.github.enterprise_server.url
    environment_variables = local.translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.environment_variables
  }
}
