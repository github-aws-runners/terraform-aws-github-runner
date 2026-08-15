# EC2 runner permission documents returned to runner-stack for attachment to
# the common runner role.
data "aws_caller_identity" "current" {}

locals {
  ssm_parameter_arn_prefix = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter"
  ssm_config_arn           = "${local.ssm_parameter_arn_prefix}${var.ssm.paths.root}/${var.ssm.paths.config}"
  cloudwatch_config_arn    = "${local.ssm_config_arn}/cloudwatch_agent_config_runner"
}

data "aws_iam_policy_document" "ssm_parameters" {
  statement {
    effect = "Allow"
    actions = [
      "ssm:DeleteParameter",
      "ssm:GetParameters",
      "ssm:GetParameter",
    ]
    resources = [
      "${local.ssm_parameter_arn_prefix}${var.ssm.paths.root}/${var.ssm.paths.tokens}/*",
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
      # Scale-set identity is controller-owned. JIT runners only need to publish
      # their lifecycle state; legacy runners retain their self-ID tag behavior.
      values = var.scale_set == null ? ["ghr:github_runner_id"] : ["ghr:scale_set_state"]
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

  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = ["${local.cloudwatch_config_arn}/*"]
  }
}

locals {
  runner_inline_policies = merge(
    {
      ssm_parameters = {
        name        = "runner-ssm-parameters"
        policy_json = data.aws_iam_policy_document.ssm_parameters.json
      }
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
