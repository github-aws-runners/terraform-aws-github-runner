module "microvm_trust_policy" {
  count  = local.provider_type == "microvm" ? 1 : 0
  source = "../compute-providers/microvm/trust-policy"

  additional_trust_policy_json = var.runner.iam.additional_trust_policy_json
}

module "microvm" {
  count  = local.provider_type == "microvm" ? 1 : 0
  source = "../compute-providers/microvm"

  aws_partition = var.aws_partition
  aws_region    = var.aws_region
  prefix        = var.prefix
  tags          = var.tags

  config = var.compute_provider.microvm
  runner = merge(var.runner, {
    iam = merge(var.runner.iam, {
      role                = local.runner_role
      managed_policy_arns = local.common_runner_managed_policy_arns
    })
  })
  github        = var.github
  ssm           = var.ssm
  observability = var.observability
}
