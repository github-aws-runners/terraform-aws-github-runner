locals {
  # Direct indexing preserves the dedicated output dependency. A full splat
  # adds the counted module's close node and creates a cycle through runner_role.
  provider_assume_role_policy = local.provider_type == "ec2" ? module.ec2[0].assume_role_policy : module.microvm[0].assume_role_policy
}
