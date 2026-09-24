# Shared control-plane configuration: naming, paths, tags, and normalized values.
locals {
  common_tags = merge(
    {
      "Name" = format("%s-action-runner", var.prefix)
    },
    var.storage_provider.aws.ssm != null ? {
      "ghr:ssm_config_path" = local.ssm_config_path
    } : {},
    var.tags,
  )

  runner_tags            = merge(local.common_tags, var.runner.tags)
  lambda_tags            = merge(local.common_tags, var.lambda.tags)
  observability_log_tags = merge(local.common_tags, var.observability.logs.tags)

  lambda_role_path            = var.lambda.role.path == null ? "/${var.prefix}/" : var.lambda.role.path
  runner_role_path            = var.runner.iam.path == null ? "/${var.prefix}/" : var.runner.iam.path
  packaged_runners_lambda_zip = "${path.module}/../../lambdas/functions/control-plane/runners.zip"
}
