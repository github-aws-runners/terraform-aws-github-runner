# EC2-specific IAM and environment fragments consumed by the common control
# plane in runner-stack.
data "aws_iam_policy_document" "ami_id_ssm_parameter_read" {
  count = local.ami_id_ssm_external ? 1 : 0

  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [local.ami_id_ssm_parameter_arn]
  }
}

resource "aws_iam_policy" "ami_id_ssm_parameter_read" {
  count       = local.ami_id_ssm_external ? 1 : 0
  name        = "${var.prefix}-ami-id-ssm-parameter-read"
  path        = local.role_path
  description = "Allows for reading ${var.prefix} GitHub runner AMI ID from an SSM parameter"
  tags        = local.provider_tags
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
      variable = "ec2:ResourceTag/ghr:environment"
      values   = [var.prefix]
    }
  }

  statement {
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [var.runner.iam.role.arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = [local.ami_id_ssm_module_managed ? aws_ssm_parameter.runner_ami_id[0].arn : local.ami_id_ssm_parameter_arn]
  }

  dynamic "statement" {
    for_each = local.ami_kms_key_enabled ? [local.ami_kms_key_arn] : []

    content {
      effect    = "Allow"
      actions   = ["kms:DescribeKey", "kms:ReEncrypt*", "kms:Decrypt"]
      resources = [statement.value]
    }
  }

  dynamic "statement" {
    for_each = local.ami_kms_key_enabled ? [local.ami_kms_key_arn] : []

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
      variable = "ec2:ResourceTag/ghr:environment"
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
    resources = [var.runner.iam.role.arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameters"]
    resources = [local.ami_id_ssm_module_managed ? aws_ssm_parameter.runner_ami_id[0].arn : local.ami_id_ssm_parameter_arn]
  }

  dynamic "statement" {
    for_each = local.ami_kms_key_enabled ? [local.ami_kms_key_arn] : []

    content {
      effect    = "Allow"
      actions   = ["kms:DescribeKey", "kms:ReEncrypt*", "kms:Decrypt"]
      resources = [statement.value]
    }
  }

  dynamic "statement" {
    for_each = local.ami_kms_key_enabled ? [local.ami_kms_key_arn] : []

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

data "aws_iam_policy_document" "scale_set" {
  count = var.scale_set == null ? 0 : 1

  statement {
    sid = "DescribeRunnerInstances"
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeLaunchTemplateVersions",
      "ec2:DescribeTags",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "CreateOwnedFleet"
    actions   = ["ec2:CreateFleet"]
    resources = ["arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:fleet/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/ghr:Application"
      values   = ["github-action-runner"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/ghr:created_by"
      values   = ["scale-set-lambda"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/ghr:scale_set_id"
      values   = [tostring(var.scale_set.id)]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/ghr:scale_set_state"
      values   = ["provisioning"]
    }
  }

  statement {
    sid       = "RunExactLaunchTemplate"
    actions   = ["ec2:RunInstances"]
    resources = ["*"]

    condition {
      test     = "ArnEquals"
      variable = "ec2:LaunchTemplate"
      values   = [aws_launch_template.runner.arn]
    }
  }

  # Launch-template tags include user-supplied EC2 tags. Restrict this grant to
  # tags created as part of the launch API instead of attempting a TagKeys list.
  statement {
    sid       = "TagRunnerAtLaunch"
    actions   = ["ec2:CreateTags"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values   = ["CreateFleet", "RunInstances"]
    }
  }

  statement {
    sid       = "UpdateOwnedRunnerLifecycle"
    actions   = ["ec2:CreateTags"]
    resources = ["arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*"]

    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:Application"
      values   = ["github-action-runner"]
    }
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:created_by"
      values   = ["scale-set-lambda"]
    }
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:environment"
      values   = [var.prefix]
    }
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:scale_set_id"
      values   = [tostring(var.scale_set.id)]
    }
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "aws:TagKeys"
      values = [
        "ghr:github_runner_id",
        "ghr:runner_name",
        "ghr:scale_set_state",
      ]
    }
  }

  statement {
    sid       = "TerminateOwnedRunners"
    actions   = ["ec2:TerminateInstances"]
    resources = ["arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*"]

    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:Application"
      values   = ["github-action-runner"]
    }
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:created_by"
      values   = ["scale-set-lambda"]
    }
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:environment"
      values   = [var.prefix]
    }
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:scale_set_id"
      values   = [tostring(var.scale_set.id)]
    }
  }

  statement {
    sid       = "PassExactRunnerRole"
    actions   = ["iam:PassRole"]
    resources = [var.runner.iam.role.arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ec2.amazonaws.com"]
    }
  }

  # EC2 resolves the launch template's resolve:ssm image reference on behalf
  # of this caller, including when this provider manages the parameter.
  statement {
    sid       = "ReadRunnerAmiParameter"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = [local.ami_id_ssm_module_managed ? aws_ssm_parameter.runner_ami_id[0].arn : local.ami_id_ssm_parameter_arn]
  }

  dynamic "statement" {
    for_each = local.ami_kms_key_enabled ? [local.ami_kms_key_arn] : []
    content {
      sid = "UseEncryptedRunnerAmi"
      actions = [
        "kms:Decrypt",
        "kms:DescribeKey",
        "kms:ReEncrypt*",
      ]
      resources = [statement.value]
    }
  }

  dynamic "statement" {
    for_each = local.ami_kms_key_enabled ? [local.ami_kms_key_arn] : []
    content {
      sid       = "GrantEncryptedRunnerAmi"
      actions   = ["kms:CreateGrant"]
      resources = [statement.value]

      condition {
        test     = "Bool"
        variable = "kms:GrantIsForAWSResource"
        values   = ["true"]
      }
    }
  }

  dynamic "statement" {
    for_each = var.config.create_service_linked_role_spot ? [true] : []
    content {
      sid       = "CreateEc2SpotServiceLinkedRole"
      actions   = ["iam:CreateServiceLinkedRole"]
      resources = ["arn:${var.aws_partition}:iam::*:role/aws-service-role/spot.amazonaws.com/AWSServiceRoleForEC2Spot"]

      condition {
        test     = "StringEquals"
        variable = "iam:AWSServiceName"
        values   = ["spot.amazonaws.com"]
      }
    }
  }
}

data "aws_iam_policy_document" "service_linked_role" {
  count = var.config.create_service_linked_role_spot ? 1 : 0

  statement {
    effect    = "Allow"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:${var.aws_partition}:iam::*:role/aws-service-role/*"]
  }
}

locals {
  scale_up_environment_variables = {
    AMI_ID_SSM_PARAMETER_NAME            = local.ami_id_ssm_parameter_name
    INSTANCE_ALLOCATION_STRATEGY         = var.config.instance_allocation_strategy
    INSTANCE_MAX_SPOT_PRICE              = var.config.instance_max_spot_price
    INSTANCE_TARGET_CAPACITY_TYPE        = var.config.instance_target_capacity_type
    INSTANCE_TYPE_PRIORITIES             = var.config.instance_type_priorities != null ? jsonencode(var.config.instance_type_priorities) : ""
    INSTANCE_TYPES                       = join(",", var.config.instance_types)
    LAUNCH_TEMPLATE_NAME                 = aws_launch_template.runner.name
    SUBNET_IDS                           = join(",", var.config.subnet_ids)
    ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS = jsonencode(var.config.enable_on_demand_failover_for_errors)
    SCALE_ERRORS                         = jsonencode(var.config.scale_errors)
    USE_DEDICATED_HOST                   = var.config.use_dedicated_host
  }

  scale_down_environment_variables = {
    RUNNER_BOOT_TIME_IN_MINUTES = var.runner.boot_time_in_minutes
  }

  pool_environment_variables = merge(local.scale_up_environment_variables, {
    RUNNER_BOOT_TIME_IN_MINUTES = var.runner.boot_time_in_minutes
  })

  scale_set_environment_variables = merge(
    {
      COMPUTE_PROVIDER_TYPE                = "ec2"
      ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS = jsonencode(var.config.enable_on_demand_failover_for_errors)
      ENVIRONMENT                          = var.prefix
      INSTANCE_ALLOCATION_STRATEGY         = var.config.instance_allocation_strategy
      INSTANCE_TARGET_CAPACITY_TYPE        = var.config.instance_target_capacity_type
      INSTANCE_TYPES                       = join(",", var.config.instance_types)
      LAUNCH_TEMPLATE_NAME                 = aws_launch_template.runner.name
      RUNNER_BOOT_TIME_IN_MINUTES          = tostring(var.runner.boot_time_in_minutes)
      SCALE_ERRORS                         = jsonencode(var.config.scale_errors)
      SUBNET_IDS                           = join(",", var.config.subnet_ids)
      USE_DEDICATED_HOST                   = tostring(var.config.use_dedicated_host)
    },
    local.ami_id_ssm_parameter_name != null ? {
      AMI_ID_SSM_PARAMETER_NAME = local.ami_id_ssm_parameter_name
    } : {},
    var.config.instance_max_spot_price != null ? {
      INSTANCE_MAX_SPOT_PRICE = var.config.instance_max_spot_price
    } : {},
    var.config.instance_type_priorities != null ? {
      INSTANCE_TYPE_PRIORITIES = jsonencode(var.config.instance_type_priorities)
    } : {},
  )

  scale_up_iam_policy_json        = data.aws_iam_policy_document.scale_up.json
  scale_down_iam_policy_json      = data.aws_iam_policy_document.scale_down.json
  pool_iam_policy_json            = data.aws_iam_policy_document.pool.json
  scale_set_iam_policy_json       = var.scale_set == null ? null : data.aws_iam_policy_document.scale_set[0].json
  service_linked_role_policy_json = var.config.create_service_linked_role_spot ? data.aws_iam_policy_document.service_linked_role[0].json : null
}
