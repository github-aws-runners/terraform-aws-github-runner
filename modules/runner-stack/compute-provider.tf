locals {
  provider_type = one([
    for provider_type, provider_config in var.compute_provider : provider_type
    if provider_config != null
  ])

  provider = {
    assume_role_policy = local.provider_type == "ec2" ? module.ec2[0].assume_role_policy : module.microvm[0].assume_role_policy
  }

  provider_contracts = {
    ec2     = one(module.ec2[*].provider)
    microvm = one(module.microvm[*].provider)
  }

  provider_contract = local.provider_contracts[local.provider_type]
}
