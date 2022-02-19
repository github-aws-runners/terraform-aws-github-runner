data "aws_caller_identity" "current" {}

resource "aws_iam_role" "deploy" {
  name = "${var.environment}-terraform"

  permissions_boundary = aws_iam_policy.deploy_boundary.arn
  assume_role_policy = templatefile("${path.module}/policies/assume-role-for-account.json", {
    account_id    = var.account_id
    aws_partition = var.aws_partition
  })
}

resource "aws_iam_policy" "boundary" {
  name = "${var.environment}-boundary"
  path = "/${var.namespaces.boundary_namespace}/"

  policy = templatefile("${path.module}/policies/boundary.json", {
    role_namespace = var.namespaces.role_namespace
    account_id     = data.aws_caller_identity.current.account_id
    aws_partition  = var.aws_partition
  })
}

resource "aws_iam_policy" "deploy" {
  name = "${var.environment}-terraform"
  path = "/"

  policy = templatefile("${path.module}/policies/deploy-policy.json", {
    account_id = data.aws_caller_identity.current.account_id
  })
}

resource "aws_iam_role_policy_attachment" "deploy" {
  role       = aws_iam_role.deploy.name
  policy_arn = aws_iam_policy.deploy.arn
}

resource "aws_iam_policy" "deploy_boundary" {
  name = "${var.environment}-terraform-boundary"
  path = "/${var.namespaces.boundary_namespace}/"

  policy = templatefile("${path.module}/policies/deploy-boundary.json", {
    account_id                 = data.aws_caller_identity.current.account_id
    role_namespace             = var.namespaces.role_namespace
    policy_namespace           = var.namespaces.policy_namespace
    instance_profile_namespace = var.namespaces.instance_profile_namespace
    boundary_namespace         = var.namespaces.boundary_namespace
    permission_boundary        = aws_iam_policy.boundary.arn
    aws_partition              = var.aws_partition
  })
}
