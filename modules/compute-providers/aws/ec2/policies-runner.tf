# EC2 runner permission documents returned to runner-config for attachment to
# the common runner role.
data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "session_manager" {
  statement {
    effect = "Allow"
    actions = [
      "ssm:DescribeAssociation",
      "ssm:GetDeployablePatchSnapshotForInstance",
      "ssm:GetDocument",
      "ssm:DescribeDocument",
      "ssm:GetManifest",
      "ssm:ListAssociations",
      "ssm:ListInstanceAssociations",
      "ssm:PutInventory",
      "ssm:PutComplianceItems",
      "ssm:PutConfigurePackageResult",
      "ssm:UpdateAssociationStatus",
      "ssm:UpdateInstanceAssociationStatus",
      "ssm:UpdateInstanceInformation",
    ]
    resources = ["*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "ec2messages:AcknowledgeMessage",
      "ec2messages:DeleteMessage",
      "ec2messages:FailMessage",
      "ec2messages:GetEndpoint",
      "ec2messages:GetMessages",
      "ec2messages:SendReply",
    ]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "distribution_bucket" {
  count = var.config.binaries_syncer.enabled ? 1 : 0

  statement {
    sid       = "githubActionDist"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:GetObjectAcl"]
    resources = ["${try(var.config.binaries_syncer.s3.arn, "")}/${try(var.config.binaries_syncer.s3.key, "")}"]
  }
}

data "aws_iam_policy_document" "describe_tags" {
  statement {
    effect    = "Allow"
    actions   = ["ec2:DescribeTags"]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "create_tags" {
  statement {
    effect    = "Allow"
    actions   = ["ec2:CreateTags"]
    resources = ["arn:*:ec2:*:*:instance/*"]

    condition {
      test     = "ForAllValues:StringEquals"
      variable = "aws:TagKeys"
      values   = ["ghr:github_runner_id"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:ARN"
      values   = ["&{ec2:SourceInstanceARN}"]
    }
  }
}

data "aws_iam_policy_document" "terminate_self" {
  statement {
    effect    = "Allow"
    actions   = ["ec2:TerminateInstances"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ARN"
      values   = ["&{ec2:SourceInstanceARN}"]
    }
  }
}

data "aws_iam_policy_document" "cloudwatch" {
  count = var.config.cloudwatch_agent.enabled ? 1 : 0

  source_policy_documents = var.storage_provider.aws.ssm != null ? [
    data.aws_iam_policy_document.ssm_cloudwatch[0].json
  ] : []

  statement {
    effect = "Allow"
    actions = [
      "cloudwatch:PutMetricData",
      "ec2:DescribeVolumes",
      "ec2:DescribeTags",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
      "logs:DescribeLogGroups",
      "logs:CreateLogStream",
    ]
    resources = ["*"]
  }
}

locals {
  runner_inline_policies = merge(
    local.ssm_runner_inline_policies,
    {
      describe_tags = {
        name        = "runner-describe-tags"
        policy_json = data.aws_iam_policy_document.describe_tags.json
      }
      create_tags = {
        name        = "runner-create-tags"
        policy_json = data.aws_iam_policy_document.create_tags.json
      }
      terminate_self = {
        name        = "ec2"
        policy_json = data.aws_iam_policy_document.terminate_self.json
      }
    },
    var.config.ssm_enabled ? {
      session_manager = {
        name        = "runner-ssm-session"
        policy_json = data.aws_iam_policy_document.session_manager.json
      }
    } : {},
    var.config.binaries_syncer.enabled ? {
      distribution_bucket = {
        name        = "distribution-bucket"
        policy_json = data.aws_iam_policy_document.distribution_bucket[0].json
      }
    } : {},
    var.config.cloudwatch_agent.enabled ? {
      cloudwatch = {
        name        = "CloudWatchLogginAndMetrics"
        policy_json = data.aws_iam_policy_document.cloudwatch[0].json
      }
    } : {},
  )
}
