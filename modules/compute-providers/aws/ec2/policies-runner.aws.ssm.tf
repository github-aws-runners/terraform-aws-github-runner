# AWS Systems Manager Parameter Store permissions returned to runner-config.
locals {
  ssm_parameter_arn_prefix = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter"
  ssm_config_arn           = "${local.ssm_parameter_arn_prefix}${local.ssm_config_path}"
  cloudwatch_config_arn    = "${local.ssm_config_arn}/cloudwatch_agent_config_runner"
}

data "aws_iam_policy_document" "ssm_parameters" {
  count = var.storage_provider.aws.ssm != null ? 1 : 0

  statement {
    effect = "Allow"
    actions = [
      "ssm:DeleteParameter",
      "ssm:GetParameters",
      "ssm:GetParameter",
    ]
    resources = [
      "${local.ssm_parameter_arn_prefix}${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.tokens}/*",
    ]

    condition {
      test     = "StringLike"
      variable = "ec2:SourceInstanceARN"
      values   = ["*/&{aws:ResourceTag/InstanceId}"]
    }
  }

  statement {
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
    ]
    resources = [
      local.ssm_config_arn,
      "${local.ssm_config_arn}/*",
    ]
  }
}
