# Provider-owned runtime and IAM fragments for the additive scale-set
# orchestration capability. GitHub credentials, GitHub scope, desired capacity,
# and boot timeout remain orchestration-owned and are not serialized here.
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
      jitConfigParameterPath  = "${var.ssm.paths.root}/${var.ssm.paths.tokens}"
      subnets                 = var.config.subnet_ids
      launchTemplateName      = aws_launch_template.runner.name
      ec2instanceCriteria     = local.scale_set_ec2_instance_criteria
      onDemandFailoverOnError = var.config.enable_on_demand_failover_for_errors
      scaleErrors             = var.config.scale_errors
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

  scale_set_owned_instance_conditions = [
    {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:Application"
      values   = toset(["github-action-runner"])
    },
    {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:created_by"
      values   = toset(["scale-set-service"])
    },
    {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ghr:environment"
      values   = toset([var.prefix])
    },
  ]

  scale_set_owned_request_conditions = [
    {
      test     = "StringEquals"
      variable = "aws:RequestTag/ghr:Application"
      values   = toset(["github-action-runner"])
    },
    {
      test     = "StringEquals"
      variable = "aws:RequestTag/ghr:created_by"
      values   = toset(["scale-set-service"])
    },
    {
      test     = "StringEquals"
      variable = "aws:RequestTag/ghr:environment"
      values   = toset([var.prefix])
    },
  ]

  scale_set_launch_dependency_resources = toset(concat(
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
  ))

  scale_set_create_fleet_dependency_resources = toset(concat(
    [
      "arn:${var.aws_partition}:ec2:${var.aws_region}::image/*",
      "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:placement-group/*",
      aws_launch_template.runner.arn,
    ],
    [
      for subnet_id in var.config.subnet_ids :
      "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:subnet/${subnet_id}"
    ],
  ))

  scale_set_iam_statements = merge(
    {
      describe_ec2 = {
        actions = toset([
          "ec2:DescribeInstances",
          "ec2:DescribeLaunchTemplateVersions",
          "ec2:DescribeTags",
        ])
        # These EC2 Describe APIs do not support resource-level permissions.
        resources  = toset(["*"])
        conditions = []
      }
      create_fleet_dependencies = {
        actions    = toset(["ec2:CreateFleet"])
        resources  = local.scale_set_create_fleet_dependency_resources
        conditions = []
      }
      create_owned_fleet_capacity = {
        actions = toset(["ec2:CreateFleet"])
        resources = toset([
          "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:fleet/*",
          "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*",
          "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:volume/*",
        ])
        conditions = local.scale_set_owned_request_conditions
      }
      run_instances_dependencies = {
        actions    = toset(["ec2:RunInstances"])
        resources  = local.scale_set_launch_dependency_resources
        conditions = []
      }
      run_owned_instances = {
        actions = toset(["ec2:RunInstances"])
        resources = toset([
          "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*",
          "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:volume/*",
        ])
        conditions = local.scale_set_owned_request_conditions
      }
      tag_runners_on_create = {
        actions   = toset(["ec2:CreateTags"])
        resources = toset(["arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*/*"])
        conditions = [
          {
            test     = "StringEquals"
            variable = "ec2:CreateAction"
            values   = toset(["CreateFleet", "RunInstances"])
          },
        ]
      }
      update_owned_runner_tags = {
        actions   = toset(["ec2:CreateTags"])
        resources = toset(["arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*"])
        conditions = concat(local.scale_set_owned_instance_conditions, [
          {
            test     = "ForAllValues:StringEquals"
            variable = "aws:TagKeys"
            values = toset([
              "ghr:github_runner_id",
              "ghr:runner_name",
              "ghr:scale_set_state",
            ])
          },
        ])
      }
      terminate_owned_runners = {
        actions    = toset(["ec2:TerminateInstances"])
        resources  = toset(["arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*"])
        conditions = local.scale_set_owned_instance_conditions
      }
      pass_runner_role = {
        actions   = toset(["iam:PassRole"])
        resources = toset([var.runner.iam.role.arn])
        conditions = [
          {
            test     = "StringEquals"
            variable = "iam:PassedToService"
            values   = toset(["ec2.amazonaws.com"])
          },
        ]
      }
      publish_runner_jit_configuration = {
        actions = toset([
          "ssm:AddTagsToResource",
          "ssm:DeleteParameter",
          "ssm:PutParameter",
        ])
        resources = toset([
          "${local.ssm_parameter_arn_prefix}${var.ssm.paths.root}/${var.ssm.paths.tokens}/*",
        ])
        conditions = []
      }
    },
    local.ami_id_ssm_external ? {
      read_external_ami_parameter = {
        actions    = toset(["ssm:GetParameter"])
        resources  = toset([local.ami_id_ssm_parameter_arn])
        conditions = []
      }
    } : {},
    local.ami_kms_key_enabled ? {
      use_ami_kms_key = {
        actions = toset([
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:ReEncryptFrom",
          "kms:ReEncryptTo",
        ])
        resources  = toset([local.ami_kms_key_arn])
        conditions = []
      }
      create_ami_kms_grant = {
        actions   = toset(["kms:CreateGrant"])
        resources = toset([local.ami_kms_key_arn])
        conditions = [
          {
            test     = "Bool"
            variable = "kms:GrantIsForAWSResource"
            values   = toset(["true"])
          },
        ]
      }
    } : {},
    var.config.create_service_linked_role_spot ? {
      create_spot_service_linked_role = {
        actions = toset(["iam:CreateServiceLinkedRole"])
        resources = toset([
          "arn:${var.aws_partition}:iam::${data.aws_caller_identity.current.account_id}:role/aws-service-role/spot.amazonaws.com/AWSServiceRoleForEC2Spot",
        ])
        conditions = [
          {
            test     = "StringEquals"
            variable = "iam:AWSServiceName"
            values   = toset(["spot.amazonaws.com"])
          },
        ]
      }
    } : {},
  )

  scale_set_capability = {
    configuration_json    = jsonencode(local.scale_set_runtime_configuration)
    environment_variables = {}
    iam_statements        = local.scale_set_iam_statements
  }
}
