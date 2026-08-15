
locals {
  job_retry_enabled = local.webhook_enabled ? local.webhook.job_retry.enabled : false
}

module "job_retry" {
  source = "./job-retry"
  count  = local.job_retry_enabled ? 1 : 0

  config = {
    prefix        = var.prefix
    aws_partition = var.aws_partition
    lambda = {
      artifact = {
        zip = local.lambda_zip
        s3  = var.lambda.s3
      }
      runtime                        = var.lambda.runtime
      architecture                   = var.lambda.architecture
      memory_size                    = local.webhook.job_retry.lambda.memory_size
      timeout                        = local.webhook.job_retry.lambda.timeout
      reserved_concurrent_executions = local.webhook.job_retry.lambda.reserved_concurrent_executions
      environment_variables          = {}
      vpc = {
        subnet_ids         = var.lambda.subnet_ids
        security_group_ids = var.lambda.security_group_ids
      }
      role = {
        path                 = local.lambda_role_path
        permissions_boundary = var.lambda.role.permissions_boundary
        principals           = var.lambda.principals
      }
    }
    runner = {
      name_prefix = var.runner.name_prefix
    }
    github = merge(var.github, local.webhook.github)
    queue = {
      build = local.webhook.queue.build
      event_source_mapping = {
        batch_size                         = local.webhook.queue.event_source_mapping.batch_size
        maximum_batching_window_in_seconds = local.webhook.queue.event_source_mapping.maximum_batching_window_in_seconds
      }
      encryption = {
        sqs_managed_sse_enabled           = true
        kms_master_key_id                 = null
        kms_data_key_reuse_period_seconds = null
      }
    }
    ssm = {
      kms_key_id = local.kms_key_id
    }
    observability = var.observability
    tags = {
      resources            = local.job_retry_tags
      lambda               = local.job_retry_lambda_tags
      log_group            = local.job_retry_log_tags
      queue                = local.job_retry_queue_tags
      event_source_mapping = local.job_retry_queue_tags
    }
  }
}
