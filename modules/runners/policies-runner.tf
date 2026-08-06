data "aws_caller_identity" "current" {}

resource "aws_iam_role" "runner" {
  count                = var.iam_overrides["override_runner_role"] ? 0 : 1
  name                 = "${substr("${var.prefix}-runner", 0, 54)}-${substr(md5("${var.prefix}-runner"), 0, 8)}"
  assume_role_policy   = templatefile("${path.module}/policies/instance-role-trust-policy.json", {})
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}

resource "aws_iam_instance_profile" "runner" {
  count = (var.iam_overrides["override_instance_profile"] || var.iam_overrides["override_runner_role"]) ? 0 : 1
  name  = "${var.prefix}-runner-profile"
  role  = aws_iam_role.runner[0].name
  path  = local.instance_profile_path
  tags  = local.tags
}

resource "aws_iam_role_policy" "runner_session_manager_aws_managed" {
  count  = (var.iam_overrides["override_runner_role"] || var.iam_overrides["override_instance_profile"]) ? 0 : (var.enable_ssm_on_runners ? 1 : 0)
  name   = "runner-ssm-session"
  role   = aws_iam_role.runner[0].name
  policy = templatefile("${path.module}/policies/instance-ssm-policy.json", {})
}

resource "aws_iam_role_policy" "ssm_parameters" {
  count = (var.iam_overrides["override_runner_role"] || var.iam_overrides["override_instance_profile"]) ? 0 : 1
  name  = "runner-ssm-parameters"
  role  = aws_iam_role.runner[0].name
  policy = templatefile("${path.module}/policies/instance-ssm-parameters-policy.json",
    {
      arn_ssm_parameters_path_tokens = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_paths.root}/${var.ssm_paths.tokens}"
      arn_ssm_parameters_path_config = local.arn_ssm_parameters_path_config
    }
  )
}

resource "aws_iam_role_policy" "dist_bucket" {
  count = (var.iam_overrides["override_runner_role"] || var.iam_overrides["override_instance_profile"]) ? 0 : (var.enable_runner_binaries_syncer ? 1 : 0)

  name = "distribution-bucket"
  role = aws_iam_role.runner[0].name
  policy = templatefile("${path.module}/policies/instance-s3-policy.json",
    {
      s3_arn = "${var.s3_runner_binaries.arn}/${var.s3_runner_binaries.key}"
    }
  )
}

resource "aws_iam_role_policy_attachment" "xray_tracing" {
  count      = (var.iam_overrides["override_runner_role"] || var.iam_overrides["override_instance_profile"]) ? 0 : (var.tracing_config.mode != null ? 1 : 0)
  role       = aws_iam_role.runner[0].name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "describe_tags" {
  count  = (var.iam_overrides["override_runner_role"] || var.iam_overrides["override_instance_profile"]) ? 0 : 1
  name   = "runner-describe-tags"
  role   = aws_iam_role.runner[0].name
  policy = file("${path.module}/policies/instance-describe-tags-policy.json")
}

resource "aws_iam_role_policy" "create_tag" {
  count  = (var.iam_overrides["override_runner_role"] || var.iam_overrides["override_instance_profile"]) ? 0 : 1
  name   = "runner-create-tags"
  role   = aws_iam_role.runner[0].name
  policy = templatefile("${path.module}/policies/instance-create-tags-policy.json", {})
}

resource "aws_iam_role_policy_attachment" "managed_policies" {
  count      = (var.iam_overrides["override_runner_role"] || var.iam_overrides["override_instance_profile"]) ? 0 : length(var.runner_iam_role_managed_policy_arns)
  role       = aws_iam_role.runner[0].name
  policy_arn = element(var.runner_iam_role_managed_policy_arns, count.index)
}

resource "aws_iam_role_policy" "ec2" {
  count  = (var.iam_overrides["override_runner_role"] || var.iam_overrides["override_instance_profile"]) ? 0 : 1
  name   = "ec2"
  role   = aws_iam_role.runner[0].name
  policy = templatefile("${path.module}/policies/instance-ec2.json", {})
}

# see also logging.tf for logging and metrics policies
