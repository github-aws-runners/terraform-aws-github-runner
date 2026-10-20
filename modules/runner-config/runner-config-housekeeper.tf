module "runner_config_housekeeper" {
  source = "./runner-config-housekeeper"

  storage_provider = {
    aws = {
      ssm = var.storage_provider.aws.ssm == null ? null : {
        cleanup = local.ssm_housekeeper_cleanup
      }
    }
  }

  config = {
    prefix        = var.prefix
    aws_partition = var.aws_partition
    schedule = {
      expression = var.storage_provider.aws.ssm.housekeeper.schedule_expression
      state      = var.storage_provider.aws.ssm.housekeeper.state
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
