locals {
  webhook_runner_config = {
    for k, v in local.translated_experimental.multi_runner_config : k => v
    if v.orchestration.webhook != null
  }

  runner_matcher_config = {
    for k, v in local.webhook_runner_config : k => {
      id              = aws_sqs_queue.queued_builds[k].id
      arn             = aws_sqs_queue.queued_builds[k].arn
      computeProvider = local.compute_provider_types[k]
      matcherConfig   = v.orchestration.webhook.matcherConfig
    }
  }
}

module "webhook" {
  source                              = "../webhook"
  prefix                              = var.prefix
  tags                                = merge(local.translated_experimental.tags, { "ghr:environment" = var.prefix })
  kms_key_arn                         = local.translated_experimental.ssm.kms_key_id
  eventbridge                         = local.translated_experimental.orchestration.webhook.eventbridge
  runner_matcher_config               = local.runner_matcher_config
  matcher_config_parameter_store_tier = local.translated_experimental.orchestration.webhook.matcher_config_parameter_store_tier

  ssm_paths = {
    root    = trimsuffix(coalesce(local.translated_experimental.ssm.paths.root, "/github-action-runners/${var.prefix}"), "/")
    webhook = local.translated_experimental.ssm.paths.webhook
  }

  github_app_parameters = {
    webhook_secret = local.github_app_parameters.webhook_secret
  }

  lambda_s3_bucket                              = local.translated_experimental.orchestration.webhook.lambda.webhook.artifact.s3 == null ? null : local.translated_experimental.lambda.artifact.s3.bucket
  webhook_lambda_s3_key                         = try(local.translated_experimental.orchestration.webhook.lambda.webhook.artifact.s3.key, null)
  webhook_lambda_s3_object_version              = try(local.translated_experimental.orchestration.webhook.lambda.webhook.artifact.s3.object_version, null)
  webhook_lambda_apigateway_access_log_settings = local.translated_experimental.orchestration.webhook.lambda.webhook.api_gateway_access_log_settings
  lambda_runtime                                = local.translated_experimental.lambda.runtime
  lambda_architecture                           = local.translated_experimental.lambda.architecture
  lambda_zip                                    = local.translated_experimental.orchestration.webhook.lambda.webhook.artifact.zip
  lambda_timeout                                = local.translated_experimental.orchestration.webhook.lambda.webhook.timeout
  lambda_memory_size                            = local.translated_experimental.orchestration.webhook.lambda.webhook.memory_size
  lambda_tags                                   = merge(local.translated_experimental.lambda.tags, local.translated_experimental.orchestration.webhook.lambda.webhook.tags)
  tracing_config                                = local.translated_experimental.observability.tracing
  logging_retention_in_days                     = local.translated_experimental.observability.logs.retention_in_days
  logging_kms_key_id                            = local.translated_experimental.observability.logs.kms_key_id
  log_class                                     = local.translated_experimental.observability.logs.class

  role_path                 = try(coalesce(local.translated_experimental.lambda.role.path, local.translated_experimental.roles.path), null)
  role_permissions_boundary = try(coalesce(local.translated_experimental.lambda.role.permissions_boundary, local.translated_experimental.roles.permissions_boundary), null)
  repository_white_list     = local.translated_experimental.orchestration.webhook.github.repository_white_list
  queue_selection_strategy  = local.translated_experimental.orchestration.webhook.queue_selection_strategy

  lambda_subnet_ids         = local.translated_experimental.lambda.subnet_ids
  lambda_security_group_ids = local.translated_experimental.lambda.security_group_ids
  aws_partition             = var.aws_partition

  log_level = local.translated_experimental.observability.logs.level
}
