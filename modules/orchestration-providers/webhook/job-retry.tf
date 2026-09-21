module "job_retry" {
  source = "./job-retry"
  count  = local.job_retry_enabled ? 1 : 0

  config = {
    prefix        = local.resolved_config.prefix
    aws_partition = var.aws_partition
    lambda = {
      artifact                       = local.resolved_config.lambda.artifact
      runtime                        = local.resolved_config.lambda.runtime
      architecture                   = local.resolved_config.lambda.architecture
      memory_size                    = local.resolved_config.job_retry.lambda.memory_size
      timeout                        = local.resolved_config.job_retry.lambda.timeout
      reserved_concurrent_executions = local.resolved_config.job_retry.lambda.reserved_concurrent_executions
      environment_variables          = {}
      vpc = {
        subnet_ids         = local.resolved_config.lambda.subnet_ids
        security_group_ids = local.resolved_config.lambda.security_group_ids
      }
      role = local.resolved_config.lambda.role
    }
    runner = {
      name_prefix = local.resolved_config.runner.name_prefix
    }
    github = local.resolved_config.github
    queue = {
      build                = local.resolved_config.queue.build
      kms_key_id           = local.resolved_config.queue.kms_key_id
      event_source_mapping = local.resolved_config.queue.event_source_mapping
      encryption = {
        sqs_managed_sse_enabled           = true
        kms_master_key_id                 = null
        kms_data_key_reuse_period_seconds = null
      }
    }
    ssm = {
      kms_key_id = local.resolved_config.ssm.kms_key_id
    }
    observability = local.resolved_config.observability
    tags = {
      resources            = local.job_retry_tags
      lambda               = local.job_retry_lambda_tags
      log_group            = local.job_retry_log_tags
      queue                = local.job_retry_queue_tags
      event_source_mapping = local.job_retry_queue_tags
    }
  }
}
