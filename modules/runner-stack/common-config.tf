# Shared control-plane configuration: naming, paths, tags, and normalized values.
locals {
  tags = merge(
    {
      "Name" = format("%s-action-runner", var.prefix)
    },
    {
      "ghr:ssm_config_path" = "${var.ssm_paths.root}/${var.ssm_paths.config}"
    },
    var.tags,
  )

  role_path                      = var.role_path == null ? "/${var.prefix}/" : var.role_path
  lambda_zip                     = var.lambda_zip == null ? "${path.module}/../../lambdas/functions/control-plane/runners.zip" : var.lambda_zip
  kms_key_arn                    = var.kms_key_arn != null ? var.kms_key_arn : ""
  enable_job_queued_check        = var.enable_job_queued_check == null ? !var.enable_ephemeral_runners : var.enable_job_queued_check
  token_path                     = "${var.ssm_paths.root}/${var.ssm_paths.tokens}"
  arn_ssm_parameters_path_config = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_paths.root}/${var.ssm_paths.config}"

  parameter_store_tags = jsonencode([
    for key, value in merge(var.tags, var.parameter_store_tags) : {
      Key   = key
      Value = value
    }
  ])
}

data "aws_caller_identity" "current" {}
