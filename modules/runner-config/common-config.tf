# Shared control-plane configuration: naming, paths, tags, and normalized values.
locals {
  common_tags            = var.tags
  runner_tags            = merge(local.common_tags, var.runner.tags)
  lambda_tags            = merge(local.common_tags, var.lambda.tags)
  observability_log_tags = merge(local.common_tags, var.observability.logs.tags)

  ssm_tags                    = merge(local.common_tags, var.ssm.tags)
  ssm_parameter_tags          = merge(local.ssm_tags, var.ssm.parameters.tags)
  ssm_housekeeper_tags        = merge(local.ssm_tags, var.ssm.housekeeper.tags)
  ssm_housekeeper_lambda_tags = merge(local.lambda_tags, var.ssm.tags, var.ssm.housekeeper.tags)
  ssm_housekeeper_log_tags    = merge(local.observability_log_tags, var.ssm.tags, var.ssm.housekeeper.tags)

  lambda_role_path            = var.lambda.role.path == null ? "/${var.prefix}/" : var.lambda.role.path
  runner_role_path            = var.runner.iam.path == null ? "/${var.prefix}/" : var.runner.iam.path
  packaged_runners_lambda_zip = "${path.module}/../../lambdas/functions/control-plane/runners.zip"
  ssm_housekeeper_artifact_s3_selected = (
    var.ssm.housekeeper.lambda.artifact.s3 != null
  )
  ssm_housekeeper_artifact = {
    zip = local.ssm_housekeeper_artifact_s3_selected ? null : coalesce(
      var.ssm.housekeeper.lambda.artifact.zip,
      local.packaged_runners_lambda_zip,
    )
    s3 = {
      bucket         = local.ssm_housekeeper_artifact_s3_selected ? var.lambda.artifact.s3.bucket : null
      key            = try(var.ssm.housekeeper.lambda.artifact.s3.key, null)
      object_version = try(var.ssm.housekeeper.lambda.artifact.s3.object_version, null)
    }
  }
  kms_key_id                     = var.ssm.kms_key_id
  token_path                     = "${var.ssm.paths.root}/${var.ssm.paths.tokens}"
  arn_ssm_parameters_path_tokens = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm.paths.root}/${var.ssm.paths.tokens}"
  arn_ssm_parameters_path_config = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm.paths.root}/${var.ssm.paths.config}"

  parameter_store_tags = jsonencode([
    for key, value in local.ssm_parameter_tags : {
      Key   = key
      Value = value
    }
  ])
}

data "aws_caller_identity" "current" {
  lifecycle {
    precondition {
      condition = (
        var.ssm.housekeeper.lambda.artifact.s3 == null ||
        var.lambda.artifact.s3.bucket != null
      )
      error_message = "lambda.artifact.s3.bucket must be set when ssm.housekeeper.lambda.artifact.s3 is selected."
    }
  }
}
