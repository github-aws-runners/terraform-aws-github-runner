
output "runners_map" {
  value = { for runner_key, runner in module.runners : runner_key => {
    launch_template_name    = runner.launch_template.name
    launch_template_id      = runner.launch_template.id
    launch_template_version = runner.launch_template.latest_version
    launch_template_ami_id  = runner.launch_template.image_id
    lambda_up               = runner.lambda_scale_up
    lambda_up_log_group     = runner.lambda_scale_up_log_group
    lambda_down             = runner.lambda_scale_down
    lambda_down_log_group   = runner.lambda_scale_down_log_group
    lambda_pool             = runner.lambda_pool
    lambda_pool_log_group   = runner.lambda_pool_log_group
    role_runner             = runner.role_runner
    role_scale_up           = runner.role_scale_up
    role_scale_down         = runner.role_scale_down
    role_pool               = runner.role_pool
    runners_log_groups      = runner.runners_log_groups
    logfiles                = runner.logfiles
    }
  }
}

output "runners_map_v2" {
  value = { for runner_key, runner in module.runner_configs : runner_key => {
    runner                 = runner.runner
    orchestration_provider = runner.orchestration_provider
    scale_up               = runner.scale_up
    scale_down             = runner.scale_down
    pool                   = runner.pool
    provider               = runner.provider
    }
  }
}

output "scale_set" {
  description = "Shared scale-set orchestration resources, or null when no runner configuration selects scale_set."
  value = length(module.orchestration_scale_set) == 0 ? null : {
    cluster                      = one(module.orchestration_scale_set[*].cluster)
    controller_groups            = one(module.orchestration_scale_set[*].controller_groups)
    reconciler_config_parameters = one(module.orchestration_scale_set[*].reconciler_config_parameters)
    resolved_container_image     = one(module.orchestration_scale_set[*].resolved_container_image)
  }
}

output "binaries_syncer_map" {
  value = { for runner_binary_key, runner_binary in module.runner_binaries : runner_binary_key => {
    lambda           = runner_binary.lambda
    lambda_log_group = runner_binary.lambda_log_group
    lambda_role      = runner_binary.lambda_role
    location         = "s3://runner_binary.bucket.id}/runner_binary.bucket.key"
    bucket           = runner_binary.bucket
  } }
}

output "webhook" {
  value = length(module.webhook) == 0 ? null : {
    gateway          = module.webhook[0].gateway
    lambda           = module.webhook[0].lambda
    lambda_log_group = module.webhook[0].lambda_log_group
    lambda_role      = module.webhook[0].role
    endpoint         = "${module.webhook[0].gateway.api_endpoint}/${module.webhook[0].endpoint_relative_path}"
    webhook          = module.webhook[0].webhook
    dispatcher       = length(module.webhook) > 0 && try(local.effective_config.orchestration_provider.webhook.eventbridge.enabled, false) ? module.webhook[0].dispatcher : null
    eventbridge      = length(module.webhook) > 0 && try(local.effective_config.orchestration_provider.webhook.eventbridge.enabled, false) ? module.webhook[0].eventbridge : null
  }
}

output "ssm_parameters" {
  value = merge(
    {
      id             = { name = local.github_app_parameters.id[0].name, arn = local.github_app_parameters.id[0].arn }
      key_base64     = { name = local.github_app_parameters.key_base64[0].name, arn = local.github_app_parameters.key_base64[0].arn }
      webhook_secret = { name = local.github_app_parameters.webhook_secret.name, arn = local.github_app_parameters.webhook_secret.arn }
    },
    { for idx, v in local.github_app_parameters.id : "github_app_id_${idx}" => {
      name = v.name
      arn  = v.arn
    } },
    { for idx, v in local.github_app_parameters.key_base64 : "github_app_key_base64_${idx}" => {
      name = v.name
      arn  = v.arn
    } },
    { "github_app_webhook_secret" = {
      name = local.github_app_parameters.webhook_secret.name
      arn  = local.github_app_parameters.webhook_secret.arn
    } },
  )
}

output "instance_termination_watcher" {
  value = try(local.effective_config.compute_provider.aws.ec2.instance_termination_watcher.enabled, false) && local.effective_config.compute_provider.aws.ec2.instance_termination_watcher.features.spot_termination_notification_watcher.enabled ? {
    lambda           = module.instance_termination_watcher[0].spot_termination_notification.lambda
    lambda_log_group = module.instance_termination_watcher[0].spot_termination_notification.lambda_log_group
    lambda_role      = module.instance_termination_watcher[0].spot_termination_notification.lambda_role
  } : null
}

output "instance_termination_handler" {
  value = try(local.effective_config.compute_provider.aws.ec2.instance_termination_watcher.enabled, false) && local.effective_config.compute_provider.aws.ec2.instance_termination_watcher.features.spot_termination_handler.enabled ? {
    lambda           = module.instance_termination_watcher[0].spot_termination_handler.lambda
    lambda_log_group = module.instance_termination_watcher[0].spot_termination_handler.lambda_log_group
    lambda_role      = module.instance_termination_watcher[0].spot_termination_handler.lambda_role
  } : null
}
