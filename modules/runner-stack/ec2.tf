locals {
  provider_type = lower(trimspace(var.compute_provider.type))
  ec2           = var.compute_provider.ec2
  provider      = one(module.ec2[*].control_plane)
}

module "ec2" {
  count  = local.provider_type == "ec2" ? 1 : 0
  source = "../compute-providers/ec2"

  aws_partition = var.aws_partition
  prefix        = var.prefix
  tags          = var.tags

  config = local.ec2
  runner = merge(var.runner, {
    iam = merge(var.runner.iam, {
      role = local.runner_role
    })
  })
  github        = var.github
  ssm           = var.ssm
  observability = var.observability
}
