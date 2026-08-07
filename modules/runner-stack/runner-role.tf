locals {
  # Role ownership belongs to the common stack. The selected compute provider
  # contributes its trust and permission documents, but does not decide whether
  # the role is created.
  create_runner_role = var.runner.iam.role == null

  runner_role = {
    arn  = local.create_runner_role ? one(aws_iam_role.runner[*].arn) : var.runner.iam.role.arn
    name = local.create_runner_role ? one(aws_iam_role.runner[*].name) : basename(var.runner.iam.role.arn)
  }

  provider_runner_policies = local.provider.policies.runner

  runner_managed_policy_arns = merge(
    {
      for policy_name, policy_arn in var.runner.iam.managed_policy_arns :
      "user-${policy_name}" => policy_arn
    },
    var.observability.tracing.mode != null ? {
      xray = "arn:${var.aws_partition}:iam::aws:policy/AWSXRayDaemonWriteAccess"
    } : {},
    {
      for policy_name, policy_arn in local.provider_runner_policies.managed_policy_arns :
      "provider-${policy_name}" => policy_arn
    },
  )
}

data "aws_iam_policy_document" "runner_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = local.provider_type == "ec2" ? ["ec2.amazonaws.com"] : []
    }
  }
}

resource "aws_iam_role" "runner" {
  count                = local.create_runner_role ? 1 : 0
  name                 = "${substr("${var.prefix}-runner", 0, 54)}-${substr(md5("${var.prefix}-runner"), 0, 8)}"
  assume_role_policy   = data.aws_iam_policy_document.runner_assume_role.json
  path                 = local.runner_role_path
  permissions_boundary = var.runner.iam.permissions_boundary
  tags                 = local.runner_tags

  lifecycle {
    precondition {
      condition     = try(var.compute_provider.ec2.instance_profile, null) == null || var.runner.iam.role != null
      error_message = "runner.iam.role must be set when compute_provider.ec2.instance_profile selects an external instance profile."
    }
  }
}

resource "aws_iam_role_policy" "runner_provider" {
  for_each = local.create_runner_role ? local.provider_runner_policies.inline_policies : {}

  name   = each.value.name
  role   = aws_iam_role.runner[0].name
  policy = each.value.policy_json
}

resource "aws_iam_role_policy_attachment" "runner" {
  for_each = local.create_runner_role ? local.runner_managed_policy_arns : {}

  role       = aws_iam_role.runner[0].name
  policy_arn = each.value
}
