locals {
  ssm_housekeeper_token_path = coalesce(var.storage_provider.aws.ssm.housekeeper.config.tokenPath, local.token_path)
  ssm_housekeeper_parameter_path_arn = (
    "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_housekeeper_token_path}*"
  )
}

module "ssm_housekeeper" {
  source = "./ssm-housekeeper"

  config = {
    prefix        = var.prefix
    aws_partition = var.aws_partition
    schedule = {
      expression = var.storage_provider.aws.ssm.housekeeper.schedule_expression
      state      = var.storage_provider.aws.ssm.housekeeper.state
    }
    cleanup = {
      token_path         = local.ssm_housekeeper_token_path
      parameter_path_arn = local.ssm_housekeeper_parameter_path_arn
      minimum_days_old   = var.storage_provider.aws.ssm.housekeeper.config.minimumDaysOld
      dry_run            = var.storage_provider.aws.ssm.housekeeper.config.dryRun
    }
    lambda = {
      # The housekeeper resolves only its component-owned selector and never
      # inherits the selected orchestration provider's runner-control artifact.
      artifact     = local.ssm_housekeeper_artifact
      runtime      = var.lambda.runtime
      architecture = var.lambda.architecture
      memory_size  = var.storage_provider.aws.ssm.housekeeper.lambda.memory_size
      timeout      = var.storage_provider.aws.ssm.housekeeper.lambda.timeout
      vpc = {
        subnet_ids         = var.lambda.subnet_ids
        security_group_ids = var.lambda.security_group_ids
      }
      role = {
        path                 = local.lambda_role_path
        permissions_boundary = var.lambda.role.permissions_boundary
        principals           = var.lambda.principals
      }
    }
    observability = {
      logs = {
        level             = var.observability.logs.level
        retention_in_days = var.observability.logs.retention_in_days
        kms_key_id        = var.observability.logs.kms_key_id
        class             = var.observability.logs.class
      }
      tracing = var.observability.tracing
    }
    tags = {
      resources = local.ssm_housekeeper_tags
      lambda    = local.ssm_housekeeper_lambda_tags
      log_group = local.ssm_housekeeper_log_tags
    }
  }
}
