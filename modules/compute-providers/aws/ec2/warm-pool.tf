# Tracks the standby instances of the webhook pool so the pool and scale-up read EC2 by instance ID instead of tag scans.
resource "aws_dynamodb_table" "warm_pool_index" {
  count = var.warm_pool.enabled ? 1 : 0

  name         = "${var.prefix}-warm-pool-index"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "environment"
  range_key    = "instanceId"

  attribute {
    name = "environment"
    type = "S"
  }

  attribute {
    name = "instanceId"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = local.provider_tags
}

data "aws_iam_policy_document" "pool_warm" {
  count = var.warm_pool.enabled ? 1 : 0

  statement {
    sid    = "WarmPoolDescribe"
    effect = "Allow"
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeLaunchTemplateVersions",
      "ec2:DescribeSpotInstanceRequests",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "WarmPoolDestroy"
    effect = "Allow"
    actions = [
      "ec2:CancelSpotInstanceRequests",
      "ec2:TerminateInstances",
    ]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:Application"
      values   = ["github-action-runner"]
    }
  }

  statement {
    sid    = "WarmPoolIndex"
    effect = "Allow"
    actions = [
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:UpdateItem",
    ]
    resources = [aws_dynamodb_table.warm_pool_index[0].arn]
  }

  statement {
    sid       = "WarmPoolReadAmiParameter"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [local.ami_id_ssm_module_managed ? aws_ssm_parameter.runner_ami_id[0].arn : local.ami_id_ssm_parameter_arn]
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

data "aws_iam_policy_document" "scale_up_warm" {
  count = var.warm_pool.enabled ? 1 : 0

  statement {
    sid    = "WarmPoolActivate"
    effect = "Allow"
    actions = [
      "ec2:CancelSpotInstanceRequests",
      "ec2:CreateTags",
      "ec2:DeleteTags",
      "ec2:StartInstances",
    ]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:Application"
      values   = ["github-action-runner"]
    }
  }

  statement {
    sid    = "WarmPoolIndex"
    effect = "Allow"
    actions = [
      "dynamodb:Query",
      "dynamodb:UpdateItem",
    ]
    resources = [aws_dynamodb_table.warm_pool_index[0].arn]
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

locals {
  warm_pool_scale_up_environment_variables = var.warm_pool.enabled ? {
    WARM_POOL_ENABLED          = "true"
    WARM_POOL_INDEX_TABLE_NAME = aws_dynamodb_table.warm_pool_index[0].name
  } : {}
  warm_pool_pool_environment_variables = var.warm_pool.enabled ? {
    WARM_POOL_INDEX_TABLE_NAME = aws_dynamodb_table.warm_pool_index[0].name
  } : {}
}
