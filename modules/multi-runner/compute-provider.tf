locals {
  compute_provider_types = {
    for runner_key, runner_config in local.multi_runner_config : runner_key => one([
      for provider_type, provider_config in runner_config.compute_provider : provider_type
      if provider_config != null
    ])
  }

  runner_config_by_provider = {
    for provider_type in toset(values(local.compute_provider_types)) :
    provider_type => {
      for runner_key, runner_config in local.multi_runner_config : runner_key => runner_config
      if local.compute_provider_types[runner_key] == provider_type
    }
  }
}
