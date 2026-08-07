locals {
  compute_provider_types = {
    for runner_key, runner_config in local.multi_runner_config : runner_key => one([
      for provider_type, provider_config in runner_config.compute_provider : provider_type
      if provider_config != null
    ])
  }

  runner_config_by_provider = {
    ec2 = {
      for runner_key, runner_config in local.multi_runner_config : runner_key => runner_config
      if local.compute_provider_types[runner_key] == "ec2"
    }
  }

  tmp_distinct_list_unique_os_and_arch = distinct([
    for _, config in local.runner_config_by_provider.ec2 : {
      "os_type" : config.runner.os,
      "architecture" : config.runner.architecture
    }
    if config.compute_provider.ec2.binaries_syncer.enabled
  ])
  unique_os_and_arch = { for _, v in local.tmp_distinct_list_unique_os_and_arch : "${v.os_type}_${v.architecture}" => v }
}
