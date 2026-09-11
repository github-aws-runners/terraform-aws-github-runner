locals {
  compute_providers = {
    aws_ec2     = var.compute_provider.aws.ec2
    aws_microvm = var.compute_provider.aws.microvm
  }

  discovered_provider_key = one([
    for provider_key, provider_config in local.compute_providers : provider_key
    if provider_config != null
  ])
  provider_key = var.compute_provider_key != null ? var.compute_provider_key : local.discovered_provider_key

  provider_types = {
    aws_ec2     = "ec2"
    aws_microvm = "microvm"
  }

  provider_type = local.provider_types[local.provider_key]

  provider_assume_role_policies = {
    aws_ec2     = try(module.compute_aws_ec2_trust_policy[0].assume_role_policy, null)
    aws_microvm = try(module.compute_aws_microvm_trust_policy[0].assume_role_policy, null)
  }

  provider_assume_role_policy = local.provider_assume_role_policies[local.provider_key]

  provider_contracts = {
    aws_ec2     = one(module.compute_aws_ec2[*].provider)
    aws_microvm = one(module.compute_aws_microvm[*].provider)
  }

  provider_contract = local.provider_contracts[local.provider_key]
}
