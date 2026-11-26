locals {
  compute_providers = {
    aws_ec2 = var.compute_provider.aws.ec2
  }

  # Provider presence is public topology; nested bootstrap values may be secret.
  # Mark the boolean first for Terraform 1.5, which rejects redundant unmarking.
  # Avoid try(): it makes selection unknown when nested values are computed.
  provider_key = one([
    for provider_key, provider_config in local.compute_providers : provider_key
    if nonsensitive(sensitive(provider_config != null))
  ])

  provider_types = {
    aws_ec2 = "ec2"
  }

  provider_type = local.provider_types[local.provider_key]

  provider_assume_role_policies = {
    aws_ec2 = try(module.compute_aws_ec2_trust_policy[0].assume_role_policy, null)
  }

  provider_assume_role_policy = local.provider_assume_role_policies[local.provider_key]

  # Avoid one() here: it promotes nested userdata sensitivity to sibling policies.
  provider_contracts = {
    aws_ec2 = local.provider_key == "aws_ec2" ? module.compute_aws_ec2[0].provider : null
  }

  provider_contract = local.provider_contracts[local.provider_key]
}
