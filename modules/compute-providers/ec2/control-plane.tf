# EC2-specific IAM and environment fragments consumed by the common control
# plane in runner-stack.
data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "ami_id_ssm_parameter_read" {
  count = local.ami_id_ssm_parameter_name != null ? 1 : 0

  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${trimprefix(local.ami_id_ssm_parameter_name, "/")}"]
  }
}

resource "aws_iam_policy" "ami_id_ssm_parameter_read" {
  count       = local.ami_id_ssm_parameter_name != null ? 1 : 0
  name        = "${var.prefix}-ami-id-ssm-parameter-read"
  path        = local.role_path
  description = "Allows for reading ${var.prefix} GitHub runner AMI ID from an SSM parameter"
  tags        = local.tags
  policy      = data.aws_iam_policy_document.ami_id_ssm_parameter_read[0].json
}

data "aws_iam_policy_document" "scale_up" {
  statement {
    effect = "Allow"
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeLaunchTemplateVersions",
      "ec2:DescribeTags",
      "ec2:RunInstances",
      "ec2:CreateFleet",
      "ec2:CreateTags",
    ]
    resources = ["*"]
  }

  statement {
    effect    = "Allow"
    actions   = ["ec2:TerminateInstances"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:Application"
      values   = ["github-action-runner"]
    }
  }

  statement {
    effect    = "Allow"
    actions   = ["ec2:TerminateInstances"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/gh:environment"
      values   = [var.prefix]
    }
  }

  statement {
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [var.runner_role.arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = [local.ami_id_ssm_module_managed ? aws_ssm_parameter.runner_ami_id[0].arn : var.ami.id_ssm_parameter_arn]
  }

  dynamic "statement" {
    for_each = local.ami_kms_key_arn != "" ? [local.ami_kms_key_arn] : []

    content {
      effect    = "Allow"
      actions   = ["kms:DescribeKey", "kms:ReEncrypt*", "kms:Decrypt"]
      resources = [statement.value]
    }
  }

  dynamic "statement" {
    for_each = local.ami_kms_key_arn != "" ? [local.ami_kms_key_arn] : []

    content {
      effect    = "Allow"
      actions   = ["kms:CreateGrant"]
      resources = [statement.value]

      condition {
        test     = "Bool"
        variable = "aws:ViaAWSService"
        values   = ["true"]
      }
    }
  }
}

data "aws_iam_policy_document" "scale_down" {
  statement {
    effect    = "Allow"
    actions   = ["ec2:DescribeInstances", "ec2:DescribeTags"]
    resources = ["*"]
  }

  statement {
    effect    = "Allow"
    actions   = ["ec2:TerminateInstances", "ec2:CreateTags", "ec2:DeleteTags"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:Application"
      values   = ["github-action-runner"]
    }
  }

  statement {
    effect    = "Allow"
    actions   = ["ec2:TerminateInstances", "ec2:CreateTags", "ec2:DeleteTags"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/gh:environment"
      values   = [var.prefix]
    }
  }
}

data "aws_iam_policy_document" "pool" {
  statement {
    effect = "Allow"
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeTags",
      "ec2:RunInstances",
      "ec2:CreateFleet",
      "ec2:CreateTags",
    ]
    resources = ["*"]
  }

  statement {
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [var.runner_role.arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameters"]
    resources = [local.ami_id_ssm_module_managed ? aws_ssm_parameter.runner_ami_id[0].arn : var.ami.id_ssm_parameter_arn]
  }

  dynamic "statement" {
    for_each = local.ami_kms_key_arn != "" ? [local.ami_kms_key_arn] : []

    content {
      effect    = "Allow"
      actions   = ["kms:DescribeKey", "kms:ReEncrypt*", "kms:Decrypt"]
      resources = [statement.value]
    }
  }

  dynamic "statement" {
    for_each = local.ami_kms_key_arn != "" ? [local.ami_kms_key_arn] : []

    content {
      effect    = "Allow"
      actions   = ["kms:CreateGrant"]
      resources = [statement.value]

      condition {
        test     = "Bool"
        variable = "aws:ViaAWSService"
        values   = ["true"]
      }
    }
  }
}

data "aws_iam_policy_document" "service_linked_role" {
  count = var.create_service_linked_role_spot ? 1 : 0

  statement {
    effect    = "Allow"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:${var.aws_partition}:iam::*:role/aws-service-role/*"]
  }
}

locals {
  scale_up_environment_variables = {
    AMI_ID_SSM_PARAMETER_NAME            = local.ami_id_ssm_parameter_name
    INSTANCE_ALLOCATION_STRATEGY         = var.instance_allocation_strategy
    INSTANCE_MAX_SPOT_PRICE              = var.instance_max_spot_price
    INSTANCE_TARGET_CAPACITY_TYPE        = var.instance_target_capacity_type
    INSTANCE_TYPE_PRIORITIES             = var.instance_type_priorities != null ? jsonencode(var.instance_type_priorities) : ""
    INSTANCE_TYPES                       = join(",", var.instance_types)
    LAUNCH_TEMPLATE_NAME                 = aws_launch_template.runner.name
    SUBNET_IDS                           = join(",", var.subnet_ids)
    ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS = jsonencode(var.enable_on_demand_failover_for_errors)
    SCALE_ERRORS                         = jsonencode(var.scale_errors)
    USE_DEDICATED_HOST                   = var.use_dedicated_host
  }

  scale_down_environment_variables = {
    RUNNER_BOOT_TIME_IN_MINUTES = var.runner_boot_time_in_minutes
  }

  pool_environment_variables = merge(local.scale_up_environment_variables, {
    RUNNER_BOOT_TIME_IN_MINUTES = var.runner_boot_time_in_minutes
  })

  scale_up_iam_policy_json        = data.aws_iam_policy_document.scale_up.json
  scale_down_iam_policy_json      = data.aws_iam_policy_document.scale_down.json
  pool_iam_policy_json            = data.aws_iam_policy_document.pool.json
  service_linked_role_policy_json = var.create_service_linked_role_spot ? data.aws_iam_policy_document.service_linked_role[0].json : null
}
