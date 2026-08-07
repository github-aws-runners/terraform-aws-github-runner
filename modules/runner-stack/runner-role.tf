# The common stack owns the runner role. The selected compute provider supplies
# the trust policy and provider-specific permission documents attached to it.
module "ec2_runner_role" {
  count  = local.provider_type == "ec2" ? 1 : 0
  source = "../compute-providers/ec2/runner-role"

  aws_partition                 = var.aws_partition
  aws_region                    = var.aws_region
  enable_cloudwatch_agent       = local.ec2.cloudwatch_agent.enabled
  enable_runner_binaries_syncer = local.ec2.binaries_syncer.enabled
  enable_ssm_on_runners         = local.ec2.ssm_enabled
  s3_runner_binaries            = local.ec2.binaries_syncer.s3
  ssm_paths                     = var.ssm.paths
}

locals {
  provider_runner_role = one(module.ec2_runner_role[*])
  create_runner_role   = local.provider_type == "ec2" && var.runner.iam.role == null

  runner_role = {
    arn  = local.create_runner_role ? one(aws_iam_role.runner[*].arn) : var.runner.iam.role.arn
    name = local.create_runner_role ? one(aws_iam_role.runner[*].name) : basename(var.runner.iam.role.arn)
  }

  runner_managed_policy_arns = merge(
    {
      for policy_name, policy_arn in var.runner.iam.managed_policy_arns :
      "user-${policy_name}" => policy_arn
    },
    var.observability.tracing.mode != null ? {
      xray = "arn:${var.aws_partition}:iam::aws:policy/AWSXRayDaemonWriteAccess"
    } : {},
    {
      for policy_name, policy_arn in try(local.provider_runner_role.managed_policy_arns, {}) :
      "provider-${policy_name}" => policy_arn
    },
  )
}

resource "aws_iam_role" "runner" {
  count                = local.create_runner_role ? 1 : 0
  name                 = "${substr("${var.prefix}-runner", 0, 54)}-${substr(md5("${var.prefix}-runner"), 0, 8)}"
  assume_role_policy   = local.provider_runner_role.assume_role_policy_json
  path                 = local.runner_role_path
  permissions_boundary = var.runner.iam.permissions_boundary
  tags                 = local.tags

  lifecycle {
    precondition {
      condition     = local.ec2.instance_profile == null || var.runner.iam.role != null
      error_message = "runner.iam.role must be set when compute_provider.ec2.instance_profile selects an external instance profile."
    }
  }
}

resource "aws_iam_role_policy" "runner_provider" {
  for_each = local.create_runner_role ? local.provider_runner_role.inline_policies : {}

  name   = each.value.name
  role   = aws_iam_role.runner[0].name
  policy = each.value.policy_json
}

resource "aws_iam_role_policy_attachment" "runner" {
  for_each = local.create_runner_role ? local.runner_managed_policy_arns : {}

  role       = aws_iam_role.runner[0].name
  policy_arn = each.value
}
