module "microvm_runner_role" {
  count  = local.provider_type == "microvm" ? 1 : 0
  source = "../compute-providers/microvm/runner-role"

  trust_services = local.provider_type == "microvm" ? var.compute_provider.microvm.runner_role_trust_services : []
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
      role = local.runner_role
    })
  })
  github        = var.github
  ssm           = var.ssm
  observability = var.observability
}
