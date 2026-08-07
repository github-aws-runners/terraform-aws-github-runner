locals {
  provider_type = one([
    for provider_type, provider_config in var.compute_provider : provider_type
    if provider_config != null
  ])

  # Direct indexing preserves the dedicated output dependency and avoids the
  # counted module's close node, which depends on the resolved runner role.
  provider_assume_role_policies = {
    ec2     = try(module.ec2[0].assume_role_policy, null)
    microvm = try(module.microvm[0].assume_role_policy, null)
  }

  provider_assume_role_policy = local.provider_assume_role_policies[local.provider_type]

  provider_contracts = {
    ec2     = one(module.ec2[*].provider)
    microvm = one(module.microvm[*].provider)
  }

  provider_contract = local.provider_contracts[local.provider_type]
}
