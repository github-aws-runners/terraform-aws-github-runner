locals {
  ssm_housekeeper_token_path = coalesce(var.ssm.housekeeper.config.tokenPath, local.token_path)
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
      expression = var.ssm.housekeeper.schedule_expression
      state      = var.ssm.housekeeper.state
    }
    cleanup = {
      token_path         = local.ssm_housekeeper_token_path
      parameter_path_arn = local.ssm_housekeeper_parameter_path_arn
      minimum_days_old   = var.ssm.housekeeper.config.minimumDaysOld
      dry_run            = var.ssm.housekeeper.config.dryRun
    }
    lambda = {
      artifact = {
        zip = local.lambda_zip
        s3  = var.lambda.s3
      }
      runtime      = var.lambda.runtime
      architecture = var.lambda.architecture
      memory_size  = var.ssm.housekeeper.lambda.memory_size
      timeout      = var.ssm.housekeeper.lambda.timeout
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
