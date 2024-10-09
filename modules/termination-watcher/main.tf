locals {
  lambda_zip = var.config.zip == null ? "${path.module}/../../lambdas/functions/termination-watcher/termination-watcher.zip" : var.config.zip
  name       = "spot-termination-watcher"

  environment_variables = {
    ENABLE_METRICS_SPOT_WARNING = var.config.metrics != null ? var.config.metrics.enable && var.config.metrics.metric.enable_spot_termination_warning : false
    TAG_FILTERS                 = jsonencode(var.config.tag_filters)
  }

  config = merge(var.config, {
    name                  = local.name,
    handler               = "index.interruptionWarning",
    zip                   = local.lambda_zip,
    environment_variables = local.environment_variables
    metrics_namespace     = var.config.metrics.namespace
  })
}
