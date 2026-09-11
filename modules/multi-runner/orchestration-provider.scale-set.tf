locals {
  scale_set_runner_config = {
    for runner_name, runner_config in local.effective_config.multi_runner_config :
    runner_name => runner_config
    if runner_config.orchestration_provider.scale_set != null
  }

  scale_set_runner_configs = {
    for runner_name, runner_config in local.scale_set_runner_config : runner_name => {
      github = {
        config_url        = local.effective_config.github.config_url
        enterprise_server = local.effective_config.github.enterprise_server
        app = {
          app_id = {
            name        = local.primary_app_id.name
            arn         = local.primary_app_id.arn
            kms_key_arn = local.effective_config.ssm.kms_key_id
          }
          private_key = {
            name        = local.primary_app_key_base64.name
            arn         = local.primary_app_key_base64.arn
            kms_key_arn = local.effective_config.ssm.kms_key_id
          }
          installation_id = {
            name        = local.primary_app_installation_id.name
            arn         = local.primary_app_installation_id.arn
            kms_key_arn = local.effective_config.ssm.kms_key_id
          }
        }
        user_agent = local.effective_config.github.user_agent
      }
      scale_set = {
        name = runner_config.orchestration_provider.scale_set.name
        runner = {
          min_runners          = runner_config.orchestration_provider.scale_set.runner.min_runners
          max_runners          = runner_config.orchestration_provider.scale_set.runner.max_runners
          boot_time_in_minutes = runner_config.orchestration_provider.scale_set.runner.boot_time_in_minutes
        }
      }
    }
  }

  scale_set_compute_provider_contracts = {
    for runner_name in keys(local.scale_set_runner_configs) :
    runner_name => module.runner_configs[runner_name].compute_provider_contract
  }
}

module "orchestration_scale_set" {
  source = "../orchestration-providers/scale-set"
  count  = length(local.scale_set_runner_configs) > 0 ? 1 : 0

  prefix                     = var.prefix
  runner_configs             = local.scale_set_runner_configs
  compute_provider_contracts = local.scale_set_compute_provider_contracts

  grouping     = try(local.effective_config.orchestration_provider.scale_set.grouping, {})
  container    = try(local.effective_config.orchestration_provider.scale_set.container, {})
  config_store = try(local.effective_config.orchestration_provider.scale_set.config_store, {})
  ecs          = try(local.effective_config.orchestration_provider.scale_set.ecs, {})
  network      = try(local.effective_config.orchestration_provider.scale_set.network, {})
  logging      = try(local.effective_config.orchestration_provider.scale_set.logging, {})
  tags = merge(
    local.effective_config.tags,
    try(local.effective_config.orchestration_provider.scale_set.tags, {}),
    { "ghr:environment" = var.prefix },
  )
}
