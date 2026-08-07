module "scale_runners" {
  source = "./scale-runners"

  aws_partition = var.aws_partition

  config = {
    prefix = var.prefix
    lambda = {
      artifact = {
        zip = local.lambda_zip
        s3  = var.lambda.s3
      }
      runtime      = var.lambda.runtime
      architecture = var.lambda.architecture
      vpc = {
        subnet_ids         = var.lambda.subnet_ids
        security_group_ids = var.lambda.security_group_ids
      }
      role = {
        path                 = local.lambda_role_path
        permissions_boundary = var.lambda.role.permissions_boundary
      }
    }
    runner = var.runner
    github = var.github
    queue = {
      build                = var.queue.build
      event_source_mapping = var.queue.event_source_mapping
    }
    ssm = {
      token_path           = local.token_path
      config_path          = "${var.ssm.paths.root}/${var.ssm.paths.config}"
      config_path_arn      = local.arn_ssm_parameters_path_config
      kms_key              = local.kms_key
      parameter_store_tags = local.parameter_store_tags
    }
    observability = var.observability
    scale_up = {
      memory_size                    = var.scale_up.memory_size
      timeout                        = var.scale_up.timeout
      reserved_concurrent_executions = var.scale_up.reserved_concurrent_executions
      job_queued_check_enabled       = local.enable_job_queued_check
      tags = {
        resources            = local.scale_up_tags
        lambda               = local.scale_up_lambda_tags
        log_group            = local.scale_up_log_tags
        event_source_mapping = local.scale_up_queue_tags
      }
    }
    scale_down = {
      memory_size                     = var.scale_down.memory_size
      timeout                         = var.scale_down.timeout
      schedule_expression             = var.scale_down.schedule_expression
      minimum_running_time_in_minutes = var.scale_down.minimum_running_time_in_minutes
      idle_config                     = var.scale_down.idle_config
      tags = {
        resources = local.scale_down_tags
        lambda    = local.scale_down_lambda_tags
        log_group = local.scale_down_log_tags
      }
    }
    job_retry = {
      enabled          = local.job_retry_enabled
      max_attempts     = var.job_retry.max_attempts
      delay_in_seconds = var.job_retry.delay_in_seconds
      delay_backoff    = var.job_retry.delay_backoff
      queue            = one(module.job_retry[*].job_retry_check_queue)
    }
  }

  runner_provider = {
    type = local.provider.type
    scale_up = {
      environment_variables      = local.provider.scale_up.environment_variables
      iam_policy_json            = local.provider.scale_up.iam_policy_json
      additional_iam_policy_json = local.provider.scale_up.additional_iam_policy_json
      managed_policy = local.provider.scale_up.managed_policy_enabled ? {
        arn = local.provider.scale_up.managed_policy_arn
      } : null
    }
    scale_down = {
      environment_variables = local.provider.scale_down.environment_variables
      iam_policy_json       = local.provider.scale_down.iam_policy_json
    }
  }
}
