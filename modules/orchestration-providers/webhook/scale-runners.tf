module "scale_runners" {
  source = "./scale-runners"

  aws_partition = var.aws_partition

  config = {
    prefix = local.resolved_config.prefix
    lambda = {
      artifact     = local.resolved_config.lambda.artifact
      runtime      = local.resolved_config.lambda.runtime
      architecture = local.resolved_config.lambda.architecture
      vpc = {
        subnet_ids         = local.resolved_config.lambda.subnet_ids
        security_group_ids = local.resolved_config.lambda.security_group_ids
      }
      role = local.resolved_config.lambda.role
    }
    runner = local.resolved_config.runner
    github = local.resolved_config.github
    queue = {
      build                = local.resolved_config.queue.build
      kms_key_id           = local.resolved_config.queue.kms_key_id
      event_source_mapping = local.resolved_config.queue.event_source_mapping
    }
    ssm = local.resolved_config.ssm
    observability = {
      logs    = local.resolved_config.observability.logs
      tracing = local.resolved_config.observability.tracing
      metrics = local.resolved_config.observability.metrics
    }
    scale_up = merge(local.resolved_config.scale_up, {
      job_queued_check_enabled = local.enable_job_queued_check
      tags = {
        resources            = local.scale_up_tags
        lambda               = local.scale_up_lambda_tags
        log_group            = local.scale_up_log_tags
        event_source_mapping = local.scale_up_queue_tags
      }
    })
    scale_down = merge(local.resolved_config.scale_down, {
      tags = {
        resources = local.scale_down_tags
        lambda    = local.scale_down_lambda_tags
        log_group = local.scale_down_log_tags
      }
    })
    job_retry = {
      enabled          = local.job_retry_enabled
      max_attempts     = local.resolved_config.job_retry.max_attempts
      delay_in_seconds = local.resolved_config.job_retry.delay_in_seconds
      delay_backoff    = local.resolved_config.job_retry.delay_backoff
      queue            = one(module.job_retry[*].job_retry_check_queue)
    }
  }

  storage_provider = {
    type       = local.resolved_config.storage_provider.type
    scale_up   = local.resolved_config.storage_provider.scale_up
    scale_down = local.resolved_config.storage_provider.scale_down
  }

  runner_provider = {
    type       = var.runner_provider.type
    scale_up   = var.runner_provider.scale_up
    scale_down = var.runner_provider.scale_down
  }
}
