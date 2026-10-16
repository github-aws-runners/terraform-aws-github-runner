locals {
  ssm_housekeeper_token_path = coalesce(try(var.storage_provider.aws.ssm.housekeeper.config.tokenPath, null), local.token_path)
  ssm_housekeeper_parameter_path_arn = (
    "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_housekeeper_token_path}*"
  )
  ssm_housekeeper_cleanup = {
    token_path         = local.ssm_housekeeper_token_path
    parameter_path_arn = local.ssm_housekeeper_parameter_path_arn
    minimum_days_old   = var.storage_provider.aws.ssm.housekeeper.config.minimumDaysOld
    dry_run            = var.storage_provider.aws.ssm.housekeeper.config.dryRun
  }
}