# EC2 runner-role trust and permission documents returned to runner-stack.
data "aws_caller_identity" "current" {}

locals {
  ssm_parameter_arn_prefix = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter"
  ssm_config_arn           = "${local.ssm_parameter_arn_prefix}${var.ssm_paths.root}/${var.ssm_paths.config}"
  cloudwatch_config_arn    = "${local.ssm_config_arn}/cloudwatch_agent_config_runner"
}

data "aws_iam_policy_document" "assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
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
      "${local.ssm_parameter_arn_prefix}${var.ssm_paths.root}/${var.ssm_paths.tokens}/*",
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
  count = var.enable_runner_binaries_syncer ? 1 : 0

  lifecycle {
    precondition {
      condition     = var.s3_runner_binaries != null
      error_message = "s3_runner_binaries must be set when enable_runner_binaries_syncer is true."
    }
  }

  statement {
    sid       = "githubActionDist"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:GetObjectAcl"]
    resources = ["${try(var.s3_runner_binaries.arn, "")}/${try(var.s3_runner_binaries.key, "")}"]
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
  count = var.enable_cloudwatch_agent ? 1 : 0

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
  inline_policies = merge(
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
    var.enable_ssm_on_runners ? {
      session_manager = {
        name        = "runner-ssm-session"
        policy_json = data.aws_iam_policy_document.session_manager.json
      }
    } : {},
    var.enable_runner_binaries_syncer ? {
      distribution_bucket = {
        name        = "distribution-bucket"
        policy_json = data.aws_iam_policy_document.distribution_bucket[0].json
      }
    } : {},
    var.enable_cloudwatch_agent ? {
      cloudwatch = {
        name        = "CloudWatchLogginAndMetrics"
        policy_json = data.aws_iam_policy_document.cloudwatch[0].json
      }
    } : {},
  )
}
