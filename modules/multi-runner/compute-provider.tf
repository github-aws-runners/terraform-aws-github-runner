locals {
  compute_provider_type_candidates = {
    for runner_key, runner_config in local.multi_runner_config : runner_key => [
      for provider_type, provider_config in runner_config.compute_provider : provider_type
      if provider_config != null
    ]
  }

  compute_provider_types = {
    for runner_key, provider_types in local.compute_provider_type_candidates :
    runner_key => one(provider_types)
  }

  runner_config_by_provider = {
    ec2 = {
      for runner_key, runner_config in local.multi_runner_config : runner_key => runner_config
      if local.compute_provider_types[runner_key] == "ec2"
    }
    microvm = {
      for runner_key, runner_config in local.multi_runner_config : runner_key => runner_config
      if local.compute_provider_types[runner_key] == "microvm"
    }
  }
}
