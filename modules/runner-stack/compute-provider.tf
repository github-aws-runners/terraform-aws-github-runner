locals {
  provider_type = one([
    for provider_type, provider_config in var.compute_provider : provider_type
    if provider_config != null
  ])

  provider_assume_role_policies = {
    ec2     = try(module.ec2[0].policies.runner.assume_role_policy, null)
    microvm = try(module.microvm[0].policies.runner.assume_role_policy, null)
  }

  provider_assume_role_policy = local.provider_assume_role_policies[local.provider_type]

  provider_contracts = {
    ec2     = one(module.ec2[*].provider)
    microvm = one(module.microvm[*].provider)
  }

  provider_contract = local.provider_contracts[local.provider_type]
}
