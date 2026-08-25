locals {
  # Role ownership belongs to the common runner configuration. The selected trust-policy
  # submodule supplies the assume-role document, while the full compute provider
  # supplies permissions after the role has been resolved.
  create_runner_role = var.runner.iam.role == null && local.provider_key != null

  runner_role = var.runner.iam.role == null ? {
    arn     = one(aws_iam_role.runner[*].arn)
    name    = one(aws_iam_role.runner[*].name)
    managed = true
    } : {
    arn     = var.runner.iam.role.arn
    name    = basename(var.runner.iam.role.arn)
    managed = false
  }

  common_runner_managed_policy_arns = merge(
    {
      for policy_name, policy_arn in var.runner.iam.managed_policy_arns :
      "user-${policy_name}" => policy_arn
    },
    var.observability.tracing.mode != null ? {
      xray = "arn:${var.aws_partition}:iam::aws:policy/AWSXRayDaemonWriteAccess"
    } : {},
  )

  provider_runner_policies = local.provider_contract.policies.runner
}

resource "aws_iam_role" "runner" {
  count                = local.create_runner_role ? 1 : 0
  name                 = "${substr("${var.prefix}-runner", 0, 54)}-${substr(md5("${var.prefix}-runner"), 0, 8)}"
  assume_role_policy   = local.provider_assume_role_policy
  path                 = local.runner_role_path
  permissions_boundary = var.runner.iam.permissions_boundary
  tags                 = local.runner_tags
}

resource "aws_iam_role_policy" "runner_provider" {
  for_each = local.create_runner_role ? local.provider_runner_policies.inline_policies : {}

  name   = each.value.name
  role   = aws_iam_role.runner[0].name
  policy = each.value.policy_json
}

resource "aws_iam_role_policy_attachment" "runner" {
  for_each = local.create_runner_role ? local.provider_runner_policies.managed_policy_arns : {}

  role       = aws_iam_role.runner[0].name
  policy_arn = each.value
}
