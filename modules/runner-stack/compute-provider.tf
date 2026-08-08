locals {
  provider_type = one([
    for provider_type, provider_config in var.compute_provider : provider_type
    if provider_config != null
  ])

  provider_runner_role_contracts = {
    ec2     = try(module.ec2[0].runner_role, null)
    microvm = try(module.microvm[0].runner_role, null)
  }

  provider_runner_role_contract = local.provider_runner_role_contracts[local.provider_type]

  provider_contracts = {
    ec2     = one(module.ec2[*].provider)
    microvm = one(module.microvm[*].provider)
  }

  provider_contract = local.provider_contracts[local.provider_type]
}
