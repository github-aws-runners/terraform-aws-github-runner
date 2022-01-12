data "aws_caller_identity" "current" {}

resource "aws_iam_role" "runner" {
  name                 = "${var.prefix}-runner-role"
  assume_role_policy   = templatefile("${path.module}/policies/instance-role-trust-policy.json", {})
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}

resource "aws_iam_instance_profile" "runner" {
  name = "${var.prefix}-runner-profile"
  role = aws_iam_role.runner.name
  path = local.instance_profile_path
  tags = local.tags
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
      arn_ssm_parameters_path_tokens = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_paths.root}/${var.ssm_paths.tokens}"
      arn_ssm_parameters_path_config = local.arn_ssm_parameters_path_config
    }
  )
}

resource "aws_iam_role_policy" "dist_bucket" {
  count = var.enable_runner_binaries_syncer ? 1 : 0

  name = "distribution-bucket"
  role = aws_iam_role.runner.name
  policy = templatefile("${path.module}/policies/instance-s3-policy.json",
    {
      s3_arn = "${var.s3_runner_binaries.arn}/${var.s3_runner_binaries.key}"
    }
  )
}

resource "aws_iam_role_policy_attachment" "xray_tracing" {
  count      = var.tracing_config.mode != null ? 1 : 0
  role       = aws_iam_role.runner.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/AWSXRayDaemonWriteAccess"
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

# see also logging.tf for logging and metrics policies

resource "aws_iam_role_policy" "gh_artifacts_bucket" {
  name = "github-ci-loop-artifacts-bucket"
  role = aws_iam_role.runner.name
  policy = templatefile("${path.module}/policies/instance-s3-gh-policy.json",
    {
      s3_arn = "arn:aws:s3:::github-ci-loop-artifacts"
      s3_packages_arn = "arn:aws:s3:::packages.shs-ie-01.intelliflo.services"
    }
  )
}

resource "aws_iam_role_policy" "runner_ecr_scan_push_access" {
  name = "ecr-scan-push-access"
  role       = aws_iam_role.runner.name
  policy = file("${path.module}/policies/instance-ecr-gh-policy.json")
}

resource "aws_iam_role_policy_attachment" "runner_code_artifact_admin_access" {
  role       = aws_iam_role.runner.name
  policy_arn = "arn:aws:iam::aws:policy/AWSCodeArtifactAdminAccess"
}

resource "aws_iam_role_policy_attachment" "runner_basic_ecr_access" {
  role       = aws_iam_role.runner.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}
