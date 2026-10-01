data "aws_iam_policy_document" "pool_warm_pool" {
  count = var.config.warm_pool.enabled ? 1 : 0

  statement {
    sid = "WarmPoolDescribe"
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeLaunchTemplateVersions",
      "ec2:DescribeSpotInstanceRequests",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "WarmPoolDestroy"
    actions   = ["ec2:CancelSpotInstanceRequests", "ec2:TerminateInstances"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:Application"
      values   = ["github-action-runner"]
    }
  }

  statement {
    sid       = "WarmPoolReadAmiParameter"
    actions   = ["ssm:GetParameter"]
    resources = [var.config.ami_id_ssm_parameter_arn]
  }

  # Launching or starting instances with the caller's credentials needs the EBS encryption key (e.g. a customer-managed default key).
  statement {
    sid = "WarmPoolEbsEncryption"
    actions = [
      "kms:CreateGrant",
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:GenerateDataKeyWithoutPlaintext",
      "kms:ReEncryptFrom",
      "kms:ReEncryptTo",
    ]
    resources = ["*"]

    condition {
      test     = "StringLike"
      variable = "kms:ViaService"
      values   = ["ec2.*.amazonaws.com", "ec2.*.amazonaws.com.cn"]
    }
  }
}

resource "aws_iam_role_policy" "pool_warm_pool" {
  count = var.config.warm_pool.enabled ? 1 : 0

  name   = "warm-pool-policy"
  role   = aws_iam_role.pool.name
  policy = data.aws_iam_policy_document.pool_warm_pool[0].json
}
