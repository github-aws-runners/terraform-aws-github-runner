module "webhook" {
  source      = "../webhook"
  prefix      = var.prefix
  tags        = local.tags
  kms_key_arn = var.kms_key_arn

  multi_runner_queues_config    = local.multi_runner_queues_config
  github_app_webhook_secret_arn = module.ssm.parameters.github_app_webhook_secret.arn

  lambda_s3_bucket                              = var.lambda_s3_bucket
  webhook_lambda_s3_key                         = var.webhook_lambda_s3_key
  webhook_lambda_s3_object_version              = var.webhook_lambda_s3_object_version
  webhook_lambda_apigateway_access_log_settings = var.webhook_lambda_apigateway_access_log_settings
  lambda_runtime                                = var.lambda_runtime
  lambda_architecture                           = var.lambda_architecture
  lambda_zip                                    = var.webhook_lambda_zip
  lambda_timeout                                = var.webhook_lambda_timeout
  logging_retention_in_days                     = var.logging_retention_in_days
  logging_kms_key_id                            = var.logging_kms_key_id

  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary
  repository_white_list     = var.repository_white_list

  log_type  = var.log_type
  log_level = var.log_level
}
