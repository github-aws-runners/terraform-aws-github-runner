# Shared control-plane configuration: naming, paths, tags, and normalized values.
locals {
  tags = merge(
    {
      "Name" = format("%s-action-runner", var.prefix)
    },
    {
      "ghr:ssm_config_path" = "${var.ssm.paths.root}/${var.ssm.paths.config}"
    },
    var.tags,
  )

  lambda_role_path               = var.lambda.role.path == null ? "/${var.prefix}/" : var.lambda.role.path
  runner_role_path               = var.runner.iam.path == null ? "/${var.prefix}/" : var.runner.iam.path
  lambda_zip                     = var.lambda.zip == null ? "${path.module}/../../lambdas/functions/control-plane/runners.zip" : var.lambda.zip
  kms_key_arn                    = var.ssm.kms_key_arn != null ? var.ssm.kms_key_arn : ""
  enable_job_queued_check        = var.scale_up.job_queued_check_enabled == null ? !var.runner.ephemeral : var.scale_up.job_queued_check_enabled
  token_path                     = "${var.ssm.paths.root}/${var.ssm.paths.tokens}"
  arn_ssm_parameters_path_config = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm.paths.root}/${var.ssm.paths.config}"

  parameter_store_tags = jsonencode([
    for key, value in merge(var.tags, var.ssm.parameter_tags) : {
      Key   = key
      Value = value
    }
  ])
}

data "aws_caller_identity" "current" {}
