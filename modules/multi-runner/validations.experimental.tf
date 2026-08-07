locals {
  experimental_multi_runner_config_v2_provider_types = {
    for runner_key, runner_config in var.experimental.multi_runner_config_v2 : runner_key => [
      for provider_type, provider_config in runner_config.compute_provider : provider_type
      if provider_config != null
    ]
  }

  experimental_multi_runner_config_v2_validations = {
    for runner_key, runner_config in var.experimental.multi_runner_config_v2 : runner_key => {
      compute_provider_selection = length(local.experimental_multi_runner_config_v2_provider_types[runner_key]) == 1
      runner_external_role_managed_policies = (
        runner_config.runner.iam.role == null ||
        length(runner_config.runner.iam.managed_policy_arns) == 0
      )
    }
  }

  experimental_multi_runner_config_v2_valid_runner_stack_keys = toset([
    for runner_key, validation in local.experimental_multi_runner_config_v2_validations : runner_key
    if validation.compute_provider_selection && validation.runner_external_role_managed_policies
  ])
}
