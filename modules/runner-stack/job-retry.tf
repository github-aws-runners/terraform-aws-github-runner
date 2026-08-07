
locals {
  job_retry_enabled = var.job_retry.enabled

  job_retry = {
    prefix                                                         = var.prefix
    tags                                                           = local.tags
    aws_partition                                                  = var.aws_partition
    architecture                                                   = var.lambda.architecture
    runtime                                                        = var.lambda.runtime
    security_group_ids                                             = var.lambda.security_group_ids
    subnet_ids                                                     = var.lambda.subnet_ids
    kms_key_arn                                                    = var.ssm.kms_key_arn
    lambda_tags                                                    = var.lambda.tags
    log_level                                                      = var.observability.log_level
    log_class                                                      = var.observability.logs.class
    logging_kms_key_id                                             = var.observability.logs.kms_key_id
    logging_retention_in_days                                      = var.observability.logs.retention_in_days
    metrics                                                        = var.observability.metrics
    role_path                                                      = var.lambda.role.path
    role_permissions_boundary                                      = var.lambda.role.permissions_boundary
    s3_bucket                                                      = var.lambda.s3.bucket
    s3_key                                                         = var.lambda.s3.key
    s3_object_version                                              = var.lambda.s3.object_version
    zip                                                            = var.lambda.zip
    tracing_config                                                 = var.observability.tracing
    github_app_parameters                                          = var.github.app_parameters
    enable_organization_runners                                    = var.github.organization_runners
    runner_name_prefix                                             = var.runner.name_prefix
    sqs_build_queue                                                = var.queue.build
    ghes_url                                                       = var.github.enterprise_server.url
    user_agent                                                     = var.github.user_agent
    lambda_event_source_mapping_batch_size                         = var.queue.event_source_mapping.batch_size
    lambda_event_source_mapping_maximum_batching_window_in_seconds = var.queue.event_source_mapping.maximum_batching_window_in_seconds
    memory_size                                                    = var.job_retry.lambda.memory_size
    reserved_concurrent_executions                                 = var.job_retry.lambda.reserved_concurrent_executions
    timeout                                                        = var.job_retry.lambda.timeout
  }
}

module "job_retry" {
  source = "./job-retry"
  count  = local.job_retry_enabled ? 1 : 0

  config = local.job_retry
}
