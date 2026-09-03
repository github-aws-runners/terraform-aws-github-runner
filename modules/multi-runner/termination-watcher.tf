locals {
  lambda_instance_termination_watcher = {
    prefix                    = var.prefix
    tags                      = local.tags
    aws_partition             = var.aws_partition
    architecture              = local.effective_config.lambda.architecture
    principals                = local.effective_config.lambda.principals
    runtime                   = local.effective_config.lambda.runtime
    security_group_ids        = local.effective_config.lambda.security_group_ids
    subnet_ids                = local.effective_config.lambda.subnet_ids
    log_level                 = local.effective_config.observability.logs.level
    log_class                 = local.effective_config.observability.logs.class
    logging_kms_key_id        = local.effective_config.observability.logs.kms_key_id
    logging_retention_in_days = local.effective_config.observability.logs.retention_in_days
    role_path                 = local.effective_config.roles.path
    role_permissions_boundary = local.effective_config.roles.permissions_boundary
    s3_bucket                 = try(local.effective_config.lambda.artifact.s3.bucket, null)
    s3_key                    = try(local.effective_config.compute_provider.aws.ec2.instance_termination_watcher.artifact.s3.key, null)
    s3_object_version         = try(local.effective_config.compute_provider.aws.ec2.instance_termination_watcher.artifact.s3.object_version, null)
    zip                       = local.effective_config.compute_provider.aws.ec2.instance_termination_watcher.artifact.zip
    tracing_config            = local.effective_config.observability.tracing
    lambda_tags               = local.effective_config.lambda.tags
    metrics = {
      enable    = local.effective_config.observability.metrics.enabled
      namespace = local.effective_config.observability.metrics.namespace
      metric = {
        enable_github_app_rate_limit    = local.effective_config.observability.metrics.metric.github_app_rate_limit_enabled
        enable_job_retry                = local.effective_config.observability.metrics.metric.job_retry_enabled
        enable_spot_termination_warning = local.effective_config.observability.metrics.metric.spot_termination_warning_enabled
      }
    }
    features = {
      enable_spot_termination_handler              = local.effective_config.compute_provider.aws.ec2.instance_termination_watcher.features.spot_termination_handler_enabled
      enable_spot_termination_notification_watcher = local.effective_config.compute_provider.aws.ec2.instance_termination_watcher.features.spot_termination_notification_watcher_enabled
    }
    enable_runner_deregistration = local.effective_config.compute_provider.aws.ec2.instance_termination_watcher.runner_deregistration_enabled
    github_app_parameters = local.effective_config.compute_provider.aws.ec2.instance_termination_watcher.runner_deregistration_enabled ? {
      id         = local.github_app_parameters.id[0]
      key_base64 = local.github_app_parameters.key_base64[0]
    } : null
    ghes_url              = local.effective_config.github.enterprise_server.url
    environment_variables = local.effective_config.compute_provider.aws.ec2.instance_termination_watcher.environment_variables
  }
}

module "instance_termination_watcher" {
  source = "../termination-watcher"
  count  = try(local.effective_config.compute_provider.aws.ec2.instance_termination_watcher.enabled, false) ? 1 : 0

  config = local.lambda_instance_termination_watcher
}
