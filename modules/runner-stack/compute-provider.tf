locals {
  provider_type = one([
    for provider_type, provider_config in var.compute_provider : provider_type
    if provider_config != null
  ])

  provider_modules = {
    ec2     = one(module.ec2[*].provider)
    microvm = one(module.microvm[*].provider)
  }

  provider = merge(local.provider_modules[local.provider_type], {
    assume_role_policy = local.provider_assume_role_policy
  })
}
