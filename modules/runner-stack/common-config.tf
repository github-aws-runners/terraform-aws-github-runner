# Shared control-plane configuration: naming, paths, tags, and normalized values.
locals {
  common_tags            = var.tags
  runner_tags            = merge(local.common_tags, var.runner.tags)
  lambda_tags            = merge(local.common_tags, var.lambda.tags)
  queue_tags             = merge(local.common_tags, var.queue.tags)
  observability_log_tags = merge(local.common_tags, var.observability.logs.tags)

  scale_up_tags        = merge(local.common_tags, var.scale_up.tags)
  scale_up_lambda_tags = merge(local.lambda_tags, var.scale_up.tags)
  scale_up_log_tags    = merge(local.observability_log_tags, var.scale_up.tags)
  scale_up_queue_tags  = merge(local.queue_tags, var.scale_up.tags)

  scale_down_tags        = merge(local.common_tags, var.scale_down.tags)
  scale_down_lambda_tags = merge(local.lambda_tags, var.scale_down.tags)
  scale_down_log_tags    = merge(local.observability_log_tags, var.scale_down.tags)

  pool_tags        = merge(local.common_tags, var.pool.tags)
  pool_lambda_tags = merge(local.lambda_tags, var.pool.tags)
  pool_log_tags    = merge(local.observability_log_tags, var.pool.tags)

  job_retry_tags        = merge(local.common_tags, var.job_retry.tags)
  job_retry_lambda_tags = merge(local.lambda_tags, var.job_retry.tags)
  job_retry_log_tags    = merge(local.observability_log_tags, var.job_retry.tags)
  job_retry_queue_tags  = merge(local.queue_tags, var.job_retry.tags)

  ssm_tags                    = merge(local.common_tags, var.ssm.tags)
  ssm_parameter_tags          = merge(local.ssm_tags, var.ssm.parameters.tags)
  ssm_housekeeper_tags        = merge(local.ssm_tags, var.ssm.housekeeper.tags)
  ssm_housekeeper_lambda_tags = merge(local.lambda_tags, var.ssm.tags, var.ssm.housekeeper.tags)
  ssm_housekeeper_log_tags    = merge(local.observability_log_tags, var.ssm.tags, var.ssm.housekeeper.tags)

  lambda_role_path               = var.lambda.role.path == null ? "/${var.prefix}/" : var.lambda.role.path
  runner_role_path               = var.runner.iam.path == null ? "/${var.prefix}/" : var.runner.iam.path
  lambda_zip                     = var.lambda.zip == null ? "${path.module}/../../lambdas/functions/control-plane/runners.zip" : var.lambda.zip
  kms_key                        = var.ssm.kms_key
  enable_job_queued_check        = var.scale_up.job_queued_check_enabled == null ? !var.runner.ephemeral : var.scale_up.job_queued_check_enabled
  token_path                     = "${var.ssm.paths.root}/${var.ssm.paths.tokens}"
  arn_ssm_parameters_path_config = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm.paths.root}/${var.ssm.paths.config}"

  parameter_store_tags = jsonencode([
    for key, value in local.ssm_parameter_tags : {
      Key   = key
      Value = value
    }
  ])
}

data "aws_caller_identity" "current" {}
