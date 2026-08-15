locals {
  packaged_runners_lambda_zip = "${path.module}/../../../lambdas/functions/control-plane/runners.zip"
  scale_artifact_s3_selected  = var.config.lambda.scale.artifact.s3 != null
  scale_artifact = {
    zip = local.scale_artifact_s3_selected ? null : coalesce(
      var.config.lambda.scale.artifact.zip,
      local.packaged_runners_lambda_zip,
    )
    s3 = {
      bucket         = local.scale_artifact_s3_selected ? var.lambda.artifact.s3.bucket : null
      key            = try(var.config.lambda.scale.artifact.s3.key, null)
      object_version = try(var.config.lambda.scale.artifact.s3.object_version, null)
    }
  }

  resolved_config = {
    prefix = var.prefix
    tags   = var.tags
    runner = merge(var.runner, {
      maximum_count = var.config.runner.maximum_count
    })
    github = merge(var.github, var.config.github)
    lambda = merge(var.lambda, {
      artifact = local.scale_artifact
    })
    queue = merge(var.config.queue, {
      event_source_mapping = var.config.lambda.scale_up.event_source_mapping
    })
    scale_up      = var.config.lambda.scale_up
    scale_down    = var.config.lambda.scale_down
    pool          = var.config.lambda.pool
    job_retry     = var.config.job_retry
    ssm           = var.ssm
    observability = var.observability
  }

  common_tags            = local.resolved_config.tags
  lambda_tags            = merge(local.common_tags, local.resolved_config.lambda.tags)
  queue_tags             = merge(local.common_tags, local.resolved_config.queue.tags)
  observability_log_tags = merge(local.common_tags, local.resolved_config.observability.logs.tags)

  scale_up_tags        = merge(local.common_tags, local.resolved_config.scale_up.tags)
  scale_up_lambda_tags = merge(local.lambda_tags, local.resolved_config.scale_up.tags)
  scale_up_log_tags    = merge(local.observability_log_tags, local.resolved_config.scale_up.tags)
  scale_up_queue_tags  = merge(local.queue_tags, local.resolved_config.scale_up.tags)

  scale_down_tags        = merge(local.common_tags, local.resolved_config.scale_down.tags)
  scale_down_lambda_tags = merge(local.lambda_tags, local.resolved_config.scale_down.tags)
  scale_down_log_tags    = merge(local.observability_log_tags, local.resolved_config.scale_down.tags)

  pool_tags        = merge(local.common_tags, local.resolved_config.pool.tags)
  pool_lambda_tags = merge(local.lambda_tags, local.resolved_config.pool.tags)
  pool_log_tags    = merge(local.observability_log_tags, local.resolved_config.pool.tags)

  job_retry_enabled     = local.resolved_config.job_retry.enabled
  job_retry_tags        = merge(local.common_tags, local.resolved_config.job_retry.tags)
  job_retry_lambda_tags = merge(local.lambda_tags, local.resolved_config.job_retry.tags)
  job_retry_log_tags    = merge(local.observability_log_tags, local.resolved_config.job_retry.tags)
  job_retry_queue_tags  = merge(local.queue_tags, local.resolved_config.job_retry.tags)

  enable_job_queued_check = local.resolved_config.scale_up.job_queued_check_enabled == null ? !local.resolved_config.runner.ephemeral : local.resolved_config.scale_up.job_queued_check_enabled
}
