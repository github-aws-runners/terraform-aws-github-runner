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

# Short-lived claims that stop concurrent scale-up invocations from starting the same warm instance.
resource "aws_dynamodb_table" "warm_pool_leases" {
  count = var.warm_pool.enabled ? 1 : 0

  name         = "${var.prefix}-warm-pool-leases"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "instanceId"

  attribute {
    name = "instanceId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
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
    sid       = "WarmPoolDescribe"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }

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
    sid       = "WarmPoolLease"
    actions   = ["dynamodb:DeleteItem", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.warm_pool_leases[0].arn]
  }

  statement {
    sid       = "WarmPoolRollbackRunnerConfig"
    actions   = ["ssm:DeleteParameter"]
    resources = ["arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.token_path}/*"]
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
