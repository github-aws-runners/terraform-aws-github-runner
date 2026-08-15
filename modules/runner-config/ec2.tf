module "ec2_trust_policy" {
  count  = local.provider_type == "ec2" ? 1 : 0
  source = "../compute-providers/ec2/trust-policy"

  additional_trust_policy_json = var.runner.iam.additional_trust_policy_json
}

module "compute_ec2" {
  count  = local.provider_type == "ec2" ? 1 : 0
  source = "../compute-providers/ec2"

  aws_partition = var.aws_partition
  aws_region    = var.aws_region
  prefix        = var.prefix
  tags          = var.tags

  config = var.compute_provider.ec2
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
