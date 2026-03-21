locals {
  lambda_zip = var.config.zip == null ? "${path.module}/../../lambdas/functions/termination-watcher/termination-watcher.zip" : var.config.zip
  name       = "spot-termination-watcher"

  enable_runner_deregistration = var.config.enable_runner_deregistration && var.config.github_app_parameters != null

  deregistration_env_vars = local.enable_runner_deregistration ? merge({
    ENABLE_RUNNER_DEREGISTRATION         = "true"
    PARAMETER_GITHUB_APP_ID_NAME         = var.config.github_app_parameters.id.name
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME = var.config.github_app_parameters.key_base64.name
    GHES_URL                             = var.config.ghes_url != null ? var.config.ghes_url : ""
  }, length(aws_sqs_queue.deregister_retry) > 0 ? {
    DEREGISTER_RETRY_QUEUE_URL = aws_sqs_queue.deregister_retry[0].url
  } : {}) : {}

  ssm_parameter_arns = local.enable_runner_deregistration ? [
    var.config.github_app_parameters.id.arn,
    var.config.github_app_parameters.key_base64.arn,
  ] : []

  environment_variables = {
    ENABLE_METRICS_SPOT_WARNING = var.config.metrics != null ? var.config.metrics.enable && var.config.metrics.metric.enable_spot_termination_warning : false
    TAG_FILTERS                 = jsonencode(var.config.tag_filters)
  }

  config = merge(var.config, {
    name                          = local.name,
    handler                       = "index.interruptionWarning",
    zip                           = local.lambda_zip,
    environment_variables         = local.environment_variables
    metrics_namespace             = var.config.metrics.namespace
    _deregistration_env_vars      = local.deregistration_env_vars
    _ssm_parameter_arns           = local.ssm_parameter_arns
    _enable_runner_deregistration = local.enable_runner_deregistration
  })
}
