# Provider-owned runtime and IAM fragments for the additive scale-set
# orchestration capability. GitHub credentials, GitHub scope, desired capacity,
# and boot timeout remain orchestration-owned and are not serialized here.
data "aws_iam_policy_document" "scale_set_capacity_launch" {
  statement {
    sid    = "ScaleSetDescribeEC2"
    effect = "Allow"
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeLaunchTemplateVersions",
      "ec2:DescribeTags",
    ]
    # These EC2 Describe APIs do not support resource-level permissions.
    resources = ["*"]
  }

  statement {
    sid     = "CreateFleetDependencies"
    effect  = "Allow"
    actions = ["ec2:CreateFleet"]
    resources = concat(
      [
        "arn:${var.aws_partition}:ec2:${var.aws_region}::image/*",
        "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:placement-group/*",
        aws_launch_template.runner.arn,
      ],
      [
        for subnet_id in var.config.subnet_ids :
        "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:subnet/${subnet_id}"
      ],
    )
  }

  statement {
    sid     = "CreateOwnedFleetCapacity"
    effect  = "Allow"
    actions = ["ec2:CreateFleet"]
    resources = [
      "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:fleet/*",
      "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*",
      "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:volume/*",
    ]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/ghr:Application"
      values   = ["github-action-runner"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/ghr:created_by"
      values   = ["scale-set-service"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/ghr:environment"
      values   = [var.prefix]
    }
  }

  statement {
    sid     = "RunInstancesDependencies"
    effect  = "Allow"
    actions = ["ec2:RunInstances"]
    resources = concat(
      [
        "arn:${var.aws_partition}:ec2:${var.aws_region}::image/*",
        "arn:${var.aws_partition}:ec2:${var.aws_region}:*:snapshot/*",
        "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:dedicated-host/*",
        "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:network-interface/*",
        "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:placement-group/*",
        "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:security-group/*",
        aws_launch_template.runner.arn,
      ],
      [
        for subnet_id in var.config.subnet_ids :
        "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:subnet/${subnet_id}"
      ],
      var.config.key_name == null ? [] : [
        "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:key-pair/${var.config.key_name}",
      ],
    )
  }

  statement {
    sid     = "RunOwnedInstances"
    effect  = "Allow"
    actions = ["ec2:RunInstances"]
    resources = [
      "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*",
      "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:volume/*",
    ]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/ghr:Application"
      values   = ["github-action-runner"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/ghr:created_by"
      values   = ["scale-set-service"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/ghr:environment"
      values   = [var.prefix]
    }
  }

  statement {
    sid       = "TagRunnersOnCreate"
    effect    = "Allow"
    actions   = ["ec2:CreateTags"]
    resources = ["arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*/*"]

    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values   = ["CreateFleet", "RunInstances"]
    }
  }

  statement {
    sid       = "PassRunnerRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [var.runner.iam.role.arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ec2.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "scale_set_runner_lifecycle" {
  statement {
    sid       = "UpdateOwnedRunnerTags"
    effect    = "Allow"
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
      values   = ["scale-set-service"]
    }
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:environment"
      values   = [var.prefix]
    }
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "aws:TagKeys"
      values   = ["ghr:github_runner_id", "ghr:runner_name", "ghr:scale_set_state"]
    }
  }

  statement {
    sid       = "TerminateOwnedRunners"
    effect    = "Allow"
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
      values   = ["scale-set-service"]
    }
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:environment"
      values   = [var.prefix]
    }
  }
}

locals {

  scale_set_ec2_instance_criteria = merge(
    {
      instanceTypes              = var.config.instance_types
      targetCapacityType         = var.config.instance_target_capacity_type
      instanceAllocationStrategy = var.config.instance_allocation_strategy
    },
    var.config.instance_type_priorities == null ? {} : {
      instanceTypePriorities = var.config.instance_type_priorities
    },
    var.config.instance_max_spot_price == null ? {} : {
      maxSpotPrice = var.config.instance_max_spot_price
    },
  )

  scale_set_runtime_configuration = merge(
    {
      region                  = var.aws_region
      environment             = var.prefix
      runnerNamePrefix        = var.runner.name_prefix
      jitConfigParameterPath  = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.tokens}"
      subnets                 = var.config.subnet_ids
      launchTemplateName      = aws_launch_template.runner.name
      ec2instanceCriteria     = local.scale_set_ec2_instance_criteria
      onDemandFailoverOnError = var.config.on_demand_failover_for_errors
      useDedicatedHost        = var.config.use_dedicated_host
      ssmParameterTags = [
        for key in sort(keys(local.ssm_parameter_tags)) : {
          Key   = key
          Value = local.ssm_parameter_tags[key]
        }
      ]
    },
    local.ami_id_ssm_external ? {
      amiIdSsmParameterName = local.ami_id_ssm_parameter_name
    } : {},
  )

  scale_set_iam_statements = merge(
    {
      capacity_launch  = data.aws_iam_policy_document.scale_set_capacity_launch.json
      runner_lifecycle = data.aws_iam_policy_document.scale_set_runner_lifecycle.json
      ssm_parameters   = data.aws_iam_policy_document.scale_set_ssm_parameters.json
    },
    var.config.create_service_linked_role_spot ? {
      spot_service_linked_role = data.aws_iam_policy_document.service_linked_role[0].json
    } : {},
  )

  scale_set_capability = {
    configuration_json    = jsonencode(local.scale_set_runtime_configuration)
    environment_variables = {}
    iam_statements        = local.scale_set_iam_statements
  }
}
