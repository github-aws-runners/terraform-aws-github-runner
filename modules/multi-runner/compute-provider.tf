locals {
  configured_compute_provider_selections = local.use_multi_runner_config_v2 ? var.experimental.compute_provider.selections : null

  discovered_compute_provider_selections = {
    for runner_key, runner_config in local.translated_experimental_base.multi_runner_config : runner_key => try(one(flatten([
      for provider_namespace, provider_configs in runner_config.compute_provider : [
        for provider_type, provider_config in provider_configs : {
          namespace = provider_namespace
          type      = provider_type
          key       = "${provider_namespace}_${provider_type}"
        }
        if provider_config != null
      ]
    ])), null)
  }

  compute_provider_selections = local.configured_compute_provider_selections != null ? {
    for runner_key, selection in local.configured_compute_provider_selections : runner_key => {
      namespace = selection.namespace
      type      = selection.type
      key       = "${selection.namespace}_${selection.type}"
    }
  } : local.discovered_compute_provider_selections

  compute_provider_keys = {
    for runner_key, selection in local.compute_provider_selections :
    runner_key => try(selection.key, null)
  }

  # The webhook runtime registry remains provider-type based. Terraform-only
  # dispatch keys include the provider namespace so future clouds can expose
  # similarly named compute services without colliding.
  compute_provider_types = {
    for runner_key, selection in local.compute_provider_selections :
    runner_key => try(selection.type, null)
  }

  runner_config_by_provider = {
    for provider_key in toset(compact(values(local.compute_provider_keys))) :
    provider_key => {
      for runner_key, runner_config in local.translated_experimental_base.multi_runner_config : runner_key => runner_config
      if local.compute_provider_keys[runner_key] == provider_key
    }
  }
}
