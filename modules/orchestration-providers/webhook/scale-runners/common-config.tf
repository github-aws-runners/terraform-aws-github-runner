locals {
  vpc_enabled = (
    length(var.config.lambda.vpc.subnet_ids) > 0 &&
    length(var.config.lambda.vpc.security_group_ids) > 0
  )

  job_retry_config = var.config.job_retry.enabled ? {
    enable         = true
    maxAttempts    = var.config.job_retry.max_attempts
    delayInSeconds = var.config.job_retry.delay_in_seconds
    delayBackoff   = var.config.job_retry.delay_backoff
    queueUrl       = var.config.job_retry.queue.url
  } : {}

  min_runtime_defaults = {
    windows = 15
    linux   = 5
    osx     = 20
  }
}
