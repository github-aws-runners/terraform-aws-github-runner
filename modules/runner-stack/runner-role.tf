locals {
  # Role ownership belongs to the common stack. The selected compute provider
  # contributes its trust and permission documents, but does not decide whether
  # the role is created.
  create_runner_role = var.runner.iam.role == null

  runner_role = {
    arn     = local.create_runner_role ? one(aws_iam_role.runner[*].arn) : var.runner.iam.role.arn
    name    = local.create_runner_role ? one(aws_iam_role.runner[*].name) : basename(var.runner.iam.role.arn)
    managed = local.create_runner_role
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

data "aws_iam_policy_document" "runner_assume_role" {
  source_policy_documents = compact([
    local.provider_runner_role_contract.trust_policy_json,
    var.runner.iam.additional_trust_policy_json,
  ])
}

resource "aws_iam_role" "runner" {
  count                = local.create_runner_role ? 1 : 0
  name                 = "${substr("${var.prefix}-runner", 0, 54)}-${substr(md5("${var.prefix}-runner"), 0, 8)}"
  assume_role_policy   = data.aws_iam_policy_document.runner_assume_role.json
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
