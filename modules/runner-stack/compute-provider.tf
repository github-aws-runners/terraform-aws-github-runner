locals {
  provider_type = one([
    for provider_type, provider_config in var.compute_provider : provider_type
    if provider_config != null
  ])

  provider_modules = {
    ec2 = one(module.ec2[*].provider)
  }

  provider = local.provider_modules[local.provider_type]
}
