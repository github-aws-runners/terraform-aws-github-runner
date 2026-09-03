module "webhook" {
  source = "../webhook"
  prefix = var.prefix
  tags = merge(
    local.tags,
    local.effective_config.orchestration_provider.webhook.lambda.webhook.tags,
  )
  kms_key_arn = local.effective_config.ssm.kms_key_id
  eventbridge = local.effective_config.orchestration_provider.webhook.eventbridge
  runner_matcher_config = {
    for k, v in local.effective_config.multi_runner_config : k => {
      arn = aws_sqs_queue.queued_builds[k].arn
      id  = aws_sqs_queue.queued_builds[k].id

      matcherConfig = v.orchestration_provider.webhook.matcherConfig
    }
  }
  matcher_config_parameter_store_tier = local.effective_config.orchestration_provider.webhook.matcher_config_parameter_store_tier

  ssm_paths = {
    root    = local.ssm_root_path
    webhook = local.effective_config.ssm.paths.webhook
  }

  github_app_parameters = {
    webhook_secret = local.github_app_parameters.webhook_secret
  }

  lambda_s3_bucket                              = try(local.effective_config.lambda.artifact.s3.bucket, null)
  webhook_lambda_s3_key                         = try(local.effective_config.orchestration_provider.webhook.lambda.webhook.artifact.s3.key, null)
  webhook_lambda_s3_object_version              = try(local.effective_config.orchestration_provider.webhook.lambda.webhook.artifact.s3.object_version, null)
  webhook_lambda_apigateway_access_log_settings = local.effective_config.orchestration_provider.webhook.lambda.webhook.api_gateway_access_log_settings
  lambda_runtime                                = local.effective_config.lambda.runtime
  lambda_architecture                           = local.effective_config.lambda.architecture
  lambda_zip                                    = local.effective_config.orchestration_provider.webhook.lambda.webhook.artifact.zip
  lambda_timeout                                = local.effective_config.orchestration_provider.webhook.lambda.webhook.timeout
  lambda_memory_size                            = local.effective_config.orchestration_provider.webhook.lambda.webhook.memory_size
  lambda_tags                                   = local.effective_config.orchestration_provider.webhook.lambda.webhook.tags
  tracing_config                                = local.effective_config.observability.tracing
  logging_retention_in_days                     = local.effective_config.observability.logs.retention_in_days
  logging_kms_key_id                            = local.effective_config.observability.logs.kms_key_id
  log_class                                     = local.effective_config.observability.logs.class

  role_path                 = local.effective_config.roles.path
  role_permissions_boundary = local.effective_config.roles.permissions_boundary
  repository_white_list     = local.effective_config.orchestration_provider.webhook.github.repository_white_list
  queue_selection_strategy  = local.effective_config.orchestration_provider.webhook.queue_selection_strategy

  lambda_subnet_ids         = local.effective_config.lambda.subnet_ids
  lambda_security_group_ids = local.effective_config.lambda.security_group_ids
  aws_partition             = var.aws_partition

  log_level = local.effective_config.observability.logs.level
}
