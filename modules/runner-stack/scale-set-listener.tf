module "scale_set_listener" {
  count  = local.scale_set_enabled ? 1 : 0
  source = "./scale-set-listener"

  config = {
    prefix        = var.prefix
    aws_region    = var.aws_region
    aws_partition = var.aws_partition
    tags          = local.scale_set_tags
    log_level     = var.observability.logs.level
    github = {
      config_url  = local.scale_set.github_config_url
      ghes_url    = var.github.enterprise_server.url
      force_ghes  = var.github.enterprise_server.url != null
      ssl_verify  = var.github.enterprise_server.ssl_verify
      user_agent  = var.github.user_agent
      kms_key_arn = local.kms_key_id
      app_parameters = {
        id              = var.github.app_parameters.id
        key_base64      = var.github.app_parameters.key_base64
        installation_id = var.github.app_parameters.installation_id
      }
    }
    scale_set = {
      id               = local.scale_set.id
      min_runners      = local.scale_set.min_runners
      max_runners      = var.runner.maximum_count
      github_app_index = local.scale_set.github_app_index
      session_owner    = local.scale_set.session_owner
      work_folder      = local.scale_set.work_folder
    }
    runner = {
      name_prefix = var.runner.name_prefix
    }
    ssm = {
      token_path           = local.token_path
      token_path_arn       = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.token_path}/*"
      parameter_store_tags = local.ssm_parameter_tags
    }
    ecs = merge(local.scale_set.ecs, {
      container_image = local.scale_set.container_image
    })
    logging = {
      retention_in_days = var.observability.logs.retention_in_days
      kms_key_id        = var.observability.logs.kms_key_id
      log_class         = var.observability.logs.class
    }
    iam = {
      role_path            = local.scale_set.iam.role_path == null ? "/${var.prefix}/" : local.scale_set.iam.role_path
      permissions_boundary = local.scale_set.iam.permissions_boundary
    }
    alarm = local.scale_set.alarm
  }

  runner_provider = {
    type                  = local.provider_type
    environment_variables = local.provider_contract.environment_variables.scale_set
    iam_policy_json       = local.provider_contract.policies.scale_set.iam_policy_json
  }
}
