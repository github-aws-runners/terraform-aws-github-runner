module "webhook" {
  source      = "../webhook"
  prefix      = var.prefix
  tags        = local.tags
  kms_key_arn = var.kms_key_arn

  runner_matcher_config               = local.runner_config
  matcher_config_parameter_store_tier = var.matcher_config_parameter_store_tier
  ssm_paths = {
    root    = local.ssm_root_path
    webhook = var.ssm_paths.webhook
  }
  sqs_workflow_job_queue = length(aws_sqs_queue.webhook_events_workflow_job_queue) > 0 ? aws_sqs_queue.webhook_events_workflow_job_queue[0] : null

  github_app_parameters = {
    webhook_secret = module.ssm.parameters.github_app_webhook_secret
  }

  lambda_s3_bucket                              = var.lambda_s3_bucket
  webhook_lambda_s3_key                         = var.webhook_lambda_s3_key
  webhook_lambda_s3_object_version              = var.webhook_lambda_s3_object_version
  webhook_lambda_apigateway_access_log_settings = var.webhook_lambda_apigateway_access_log_settings
  lambda_runtime                                = var.lambda_runtime
  lambda_architecture                           = var.lambda_architecture
  lambda_zip                                    = var.webhook_lambda_zip
  lambda_timeout                                = var.webhook_lambda_timeout
  lambda_memory_size                            = var.webhook_lambda_memory_size
  lambda_tags                                   = var.lambda_tags
  tracing_config                                = var.tracing_config
  logging_retention_in_days                     = var.logging_retention_in_days
  logging_kms_key_id                            = var.logging_kms_key_id

  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary
  repository_white_list     = var.repository_white_list

  lambda_subnet_ids         = var.lambda_subnet_ids
  lambda_security_group_ids = var.lambda_security_group_ids
  aws_partition             = var.aws_partition

  log_level = var.log_level
}
