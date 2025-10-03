locals {
  # config with combined key and order
  runner_matcher_config = { for k, v in var.runner_matcher_config : format("%03d-%s", v.matcherConfig.priority, k) => merge(v, { key = k }) }

  # sorted list
  runner_matcher_config_sorted = [for k in sort(keys(local.runner_matcher_config)) : local.runner_matcher_config[k]]

  # Encode the sorted matcher config as JSON
  matcher_json = jsonencode(local.runner_matcher_config_sorted)

  # Set max chunk size based on SSM tier
  # AWS SSM limits:
  #   - Standard: 4096 bytes
  #   - Advanced: 8192 bytes
  # We leave a small safety margin to avoid hitting the exact limit
  # (e.g., escaped characters or minor overhead could exceed the limit)
  max_chunk_size = var.matcher_config_parameter_store_tier == "Advanced" ? 8000 : 4000

  # Split JSON into chunks safely under the SSM limit
  matcher_chunks = [
    for i in range(0, length(local.matcher_json), local.max_chunk_size) :
    substr(local.matcher_json, i, local.max_chunk_size)
  ]
}

resource "aws_ssm_parameter" "runner_matcher_config" {
  count = length(local.matcher_chunks)

  name  = "${var.ssm_paths.root}/${var.ssm_paths.webhook}/runner-matcher-config${length(local.matcher_chunks) > 1 ? "-${count.index}" : ""}"
  type  = "String"
  value = local.matcher_chunks[count.index]
  tier  = var.matcher_config_parameter_store_tier
  tags  = var.tags
}

module "direct" {
  count  = var.eventbridge.enable ? 0 : 1
  source = "./direct"

  config = {
    lambda_subnet_ids                     = var.lambda_subnet_ids,
    lambda_security_group_ids             = var.lambda_security_group_ids,
    prefix                                = var.prefix,
    tags                                  = var.tags,
    runner_matcher_config                 = var.runner_matcher_config,
    sqs_job_queues_arns                   = [for k, v in var.runner_matcher_config : v.arn]
    lambda_zip                            = var.lambda_zip,
    lambda_memory_size                    = var.lambda_memory_size,
    lambda_timeout                        = var.lambda_timeout,
    role_permissions_boundary             = var.role_permissions_boundary,
    role_path                             = local.role_path,
    logging_retention_in_days             = var.logging_retention_in_days,
    logging_kms_key_id                    = var.logging_kms_key_id,
    lambda_s3_bucket                      = var.lambda_s3_bucket,
    lambda_s3_key                         = var.webhook_lambda_s3_key,
    lambda_s3_object_version              = var.webhook_lambda_s3_object_version,
    lambda_apigateway_access_log_settings = var.webhook_lambda_apigateway_access_log_settings,
    repository_white_list                 = var.repository_white_list,
    kms_key_arn                           = var.kms_key_arn,
    log_level                             = var.log_level,
    lambda_runtime                        = var.lambda_runtime,
    aws_partition                         = var.aws_partition,
    lambda_architecture                   = var.lambda_architecture,
    github_app_parameters                 = var.github_app_parameters,
    tracing_config                        = var.tracing_config,
    lambda_tags                           = var.lambda_tags,
    matcher_config_parameter_store_tier   = var.matcher_config_parameter_store_tier,
    api_gw_source_arn                     = "${aws_apigatewayv2_api.webhook.execution_arn}/*/*/${local.webhook_endpoint}"
    ssm_parameter_runner_matcher_config = [
      for p in aws_ssm_parameter.runner_matcher_config : {
        name    = p.name
        arn     = p.arn
        version = p.version
      }
    ]
  }
}

module "eventbridge" {
  count  = var.eventbridge.enable ? 1 : 0
  source = "./eventbridge"

  config = {
    lambda_subnet_ids                     = var.lambda_subnet_ids,
    lambda_security_group_ids             = var.lambda_security_group_ids,
    prefix                                = var.prefix,
    tags                                  = var.tags,
    sqs_job_queues_arns                   = [for k, v in var.runner_matcher_config : v.arn]
    lambda_zip                            = var.lambda_zip,
    lambda_memory_size                    = var.lambda_memory_size,
    lambda_timeout                        = var.lambda_timeout,
    role_permissions_boundary             = var.role_permissions_boundary,
    role_path                             = local.role_path,
    logging_retention_in_days             = var.logging_retention_in_days,
    logging_kms_key_id                    = var.logging_kms_key_id,
    lambda_s3_bucket                      = var.lambda_s3_bucket,
    lambda_s3_key                         = var.webhook_lambda_s3_key,
    lambda_s3_object_version              = var.webhook_lambda_s3_object_version,
    lambda_apigateway_access_log_settings = var.webhook_lambda_apigateway_access_log_settings,
    repository_white_list                 = var.repository_white_list,
    kms_key_arn                           = var.kms_key_arn,
    log_level                             = var.log_level,
    lambda_runtime                        = var.lambda_runtime,
    aws_partition                         = var.aws_partition,
    lambda_architecture                   = var.lambda_architecture,
    github_app_parameters                 = var.github_app_parameters,
    tracing_config                        = var.tracing_config,
    lambda_tags                           = var.lambda_tags,
    api_gw_source_arn                     = "${aws_apigatewayv2_api.webhook.execution_arn}/*/*/${local.webhook_endpoint}"
    ssm_parameter_runner_matcher_config = [
      for p in aws_ssm_parameter.runner_matcher_config : {
        name    = p.name
        arn     = p.arn
        version = p.version
      }
    ]
    accept_events = var.eventbridge.accept_events
  }

}
