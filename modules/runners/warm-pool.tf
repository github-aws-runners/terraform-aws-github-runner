resource "terraform_data" "warm_pool_validation" {
  count = var.warm_pool.enabled ? 1 : 0

  lifecycle {
    precondition {
      condition     = length(var.pool_config) > 0
      error_message = "warm_pool.enabled requires at least one pool_config entry."
    }
    precondition {
      condition     = contains(["linux", "windows"], var.runner_os)
      error_message = "warm_pool supports only linux and windows runners."
    }
    precondition {
      condition     = try(var.metadata_options.instance_metadata_tags, "enabled") != "disabled"
      error_message = "warm_pool requires metadata_options.instance_metadata_tags to be enabled."
    }
  }
}

# Tracks the standby instances of the pool so the pool and scale-up read EC2 by instance ID instead of tag scans.
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

  tags = local.tags
}

data "aws_iam_policy_document" "scale_up_warm_pool" {
  count = var.warm_pool.enabled ? 1 : 0

  statement {
    sid = "WarmPoolActivate"
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
    sid       = "WarmPoolIndex"
    actions   = ["dynamodb:Query", "dynamodb:UpdateItem"]
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

resource "aws_iam_role_policy" "scale_up_warm_pool" {
  count = var.warm_pool.enabled ? 1 : 0

  name   = "warm-pool-policy"
  role   = aws_iam_role.scale_up.name
  policy = data.aws_iam_policy_document.scale_up_warm_pool[0].json
}
