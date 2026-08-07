locals {
  provider_assume_role_policies = {
    ec2     = one(module.ec2_runner_role[*].assume_role_policy)
    microvm = one(module.microvm_runner_role[*].assume_role_policy)
  }

  # Trust policies come from role-independent provider contracts because the
  # full provider modules consume the common runner role created from them.
  provider_assume_role_policy = local.provider_type == null ? local.empty_provider_policy_json : local.provider_assume_role_policies[local.provider_type]
}
