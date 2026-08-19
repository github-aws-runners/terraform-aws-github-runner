module "compute_aws_ec2_trust_policy" {
  count  = local.provider_key == "aws_ec2" ? 1 : 0
  source = "../compute-providers/aws/ec2/trust-policy"

  additional_trust_policy_json = var.runner.iam.additional_trust_policy_json
}

module "compute_aws_ec2" {
  count  = local.provider_key == "aws_ec2" ? 1 : 0
  source = "../compute-providers/aws/ec2"

  aws_partition = var.aws_partition
  aws_region    = var.aws_region
  prefix        = var.prefix
  tags          = var.tags

  config = var.compute_provider.aws.ec2
  runner = merge(var.runner, {
    iam = merge(var.runner.iam, {
      role                = local.runner_role
      managed_policy_arns = local.common_runner_managed_policy_arns
    })
  })
  github = var.github
  ssm    = var.ssm
  storage_provider = {
    type   = var.storage_provider.type
    runner = var.storage_provider.runner
  }
  observability = var.observability
}

moved {
  from = module.compute_ec2_trust_policy
  to   = module.compute_aws_ec2_trust_policy
}

moved {
  from = module.compute_ec2
  to   = module.compute_aws_ec2
}
