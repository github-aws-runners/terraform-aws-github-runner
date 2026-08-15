moved {
  from = module.scale_runners
  to   = module.scale_runners[0]
}

module "scale_runners" {
  count  = local.webhook_enabled ? 1 : 0
  source = "./scale-runners"

  aws_partition = var.aws_partition

  config = {
    prefix  = var.prefix
    enabled = true
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
        principals           = var.lambda.principals
      }
    }
    runner = var.runner
    github = merge(var.github, local.webhook.github)
    queue = {
      build                = local.webhook.queue.build
      event_source_mapping = local.webhook.queue.event_source_mapping
    }
    ssm = {
      token_path           = local.token_path
      config_path          = "${var.ssm.paths.root}/${var.ssm.paths.config}"
      config_path_arn      = local.arn_ssm_parameters_path_config
      kms_key_id           = local.kms_key_id
      parameter_store_tags = local.parameter_store_tags
    }
    observability = var.observability
    scale_up = {
      memory_size                    = local.webhook.scale_up.memory_size
      timeout                        = local.webhook.scale_up.timeout
      reserved_concurrent_executions = local.webhook.scale_up.reserved_concurrent_executions
      job_queued_check_enabled       = local.enable_job_queued_check
      tags = {
        resources            = local.scale_up_tags
        lambda               = local.scale_up_lambda_tags
        log_group            = local.scale_up_log_tags
        event_source_mapping = local.scale_up_queue_tags
      }
    }
    scale_down = {
      memory_size                     = local.webhook.scale_down.memory_size
      timeout                         = local.webhook.scale_down.timeout
      schedule_expression             = local.webhook.scale_down.schedule_expression
      minimum_running_time_in_minutes = local.webhook.scale_down.minimum_running_time_in_minutes
      idle_config                     = local.webhook.scale_down.idle_config
      tags = {
        resources = local.scale_down_tags
        lambda    = local.scale_down_lambda_tags
        log_group = local.scale_down_log_tags
      }
    }
    job_retry = {
      enabled          = local.job_retry_enabled
      max_attempts     = local.webhook.job_retry.max_attempts
      delay_in_seconds = local.webhook.job_retry.delay_in_seconds
      delay_backoff    = local.webhook.job_retry.delay_backoff
      queue            = one(module.job_retry[*].job_retry_check_queue)
    }
  }

  runner_provider = {
    type = local.provider_type
    scale_up = {
      environment_variables      = local.provider_contract.environment_variables.scale_up
      iam_policy_json            = local.provider_contract.policies.scale_up.iam_policy_json
      additional_iam_policy_json = local.provider_contract.policies.scale_up.additional_iam_policy_json
      managed_policy = local.provider_contract.policies.scale_up.managed_policy_enabled ? {
        arn = local.provider_contract.policies.scale_up.managed_policy_arn
      } : null
    }
    scale_down = {
      environment_variables = local.provider_contract.environment_variables.scale_down
      iam_policy_json       = local.provider_contract.policies.scale_down.iam_policy_json
    }
  }
}
