locals {
  webhook_runner_config = {
    for k, v in local.effective_config.multi_runner_config : k => v
    if v.orchestration_provider.webhook != null
  }

  runner_matcher_config = {
    for k, v in local.webhook_runner_config : k => {
      id              = aws_sqs_queue.queued_builds[k].id
      arn             = aws_sqs_queue.queued_builds[k].arn
      computeProvider = "ec2"
      matcherConfig = {
        labelMatchers           = v.orchestration_provider.webhook.matcherConfig.labelMatchers
        exactMatch              = v.orchestration_provider.webhook.matcherConfig.exactMatch
        bidirectionalLabelMatch = v.orchestration_provider.webhook.matcherConfig.bidirectionalLabelMatch
        priority                = v.orchestration_provider.webhook.matcherConfig.priority
        enableDynamicLabels     = v.orchestration_provider.webhook.matcherConfig.dynamic_labels_enabled
        awsDynamicLabelsPolicy  = v.orchestration_provider.webhook.matcherConfig.awsDynamicLabelsPolicy
      }
    }
  }
}

module "webhook" {
  source      = "../webhook"
  count       = length(local.webhook_runner_config) > 0 ? 1 : 0
  prefix      = var.prefix
  tags        = local.tags
  kms_key_arn = local.effective_config.ssm.kms_key_id
  eventbridge = {
    enable        = try(local.effective_config.orchestration_provider.webhook.eventbridge.enabled, false)
    accept_events = try(local.effective_config.orchestration_provider.webhook.eventbridge.accept_events, [])
  }
  runner_matcher_config               = local.runner_matcher_config
  matcher_config_parameter_store_tier = try(local.effective_config.orchestration_provider.webhook.matcher_config_parameter_store_tier, "Standard")

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
  webhook_lambda_apigateway_access_log_settings = try(local.effective_config.orchestration_provider.webhook.lambda.webhook.api_gateway_access_log_settings, null)
  lambda_runtime                                = local.effective_config.lambda.runtime
  lambda_architecture                           = local.effective_config.lambda.architecture
  lambda_zip                                    = try(local.effective_config.orchestration_provider.webhook.lambda.webhook.artifact.zip, null)
  lambda_timeout                                = try(local.effective_config.orchestration_provider.webhook.lambda.webhook.timeout, null)
  lambda_memory_size                            = try(local.effective_config.orchestration_provider.webhook.lambda.webhook.memory_size, null)
  lambda_tags                                   = try(local.effective_config.orchestration_provider.webhook.lambda.webhook.tags, {})
  tracing_config                                = local.effective_config.observability.tracing
  logging_retention_in_days                     = local.effective_config.observability.logs.retention_in_days
  logging_kms_key_id                            = local.effective_config.observability.logs.kms_key_id
  log_class                                     = local.effective_config.observability.logs.class

  role_path                 = local.effective_config.roles.path
  role_permissions_boundary = local.effective_config.roles.permissions_boundary
  repository_white_list     = try(local.effective_config.orchestration_provider.webhook.github.repository_white_list, [])
  queue_selection_strategy  = try(local.effective_config.orchestration_provider.webhook.queue_selection_strategy, "first")

  lambda_subnet_ids         = local.effective_config.lambda.subnet_ids
  lambda_security_group_ids = local.effective_config.lambda.security_group_ids
  aws_partition             = var.aws_partition

  log_level = local.effective_config.observability.logs.level
}
