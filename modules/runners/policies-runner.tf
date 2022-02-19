data "aws_caller_identity" "current" {}

resource "aws_iam_role" "runner" {
  name                 = "${var.environment}-runner-role"
  assume_role_policy   = templatefile("${path.module}/policies/instance-role-trust-policy.json", {})
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}

resource "aws_iam_instance_profile" "runner" {
  name = "${var.environment}-runner-profile"
  role = aws_iam_role.runner.name
  path = local.instance_profile_path
}

resource "aws_iam_role_policy" "runner_session_manager_aws_managed" {
  name   = "runner-ssm-session"
  count  = var.enable_ssm_on_runners ? 1 : 0
  role   = aws_iam_role.runner.name
  policy = templatefile("${path.module}/policies/instance-ssm-policy.json", {})
}

resource "aws_iam_role_policy" "ssm_parameters" {
  name = "runner-ssm-parameters"
  role = aws_iam_role.runner.name
  policy = templatefile("${path.module}/policies/instance-ssm-parameters-policy.json",
    {
      arn_ssm_parameters_prefix = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.environment}-*"
      arn_ssm_parameters_path   = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.environment}/*"
    }
  )
}

resource "aws_iam_role_policy" "dist_bucket" {
  name = "distribution-bucket"
  role = aws_iam_role.runner.name
  policy = templatefile("${path.module}/policies/instance-s3-policy.json",
    {
      s3_arn = var.s3_bucket_runner_binaries.arn
    }
  )
}

resource "aws_iam_role_policy" "describe_tags" {
  name   = "runner-describe-tags"
  role   = aws_iam_role.runner.name
  policy = file("${path.module}/policies/instance-describe-tags-policy.json")
}

resource "aws_iam_role_policy_attachment" "managed_policies" {
  count      = length(var.runner_iam_role_managed_policy_arns)
  role       = aws_iam_role.runner.name
  policy_arn = element(var.runner_iam_role_managed_policy_arns, count.index)
}


resource "aws_iam_role_policy" "ec2" {
  name   = "ec2"
  role   = aws_iam_role.runner.name
  policy = templatefile("${path.module}/policies/instance-ec2.json", {})
}

// see also logging.tf for logging and metrics policies
