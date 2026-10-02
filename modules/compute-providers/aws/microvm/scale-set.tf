# Provider-owned runtime and IAM fragments for the additive scale-set
# orchestration capability. GitHub credentials, GitHub scope, desired capacity,
# and boot timeout remain orchestration-owned and are not serialized here.
data "aws_iam_policy_document" "scale_set_list_microvms" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:ListMicrovms"]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "scale_set_pass_network_connectors" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:PassNetworkConnector"]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "scale_set_launch_microvms" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:RunMicrovm"]
    resources = local.microvm_image_resource_arns
  }
}

data "aws_iam_policy_document" "scale_set_terminate_microvms" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:TerminateMicrovm"]
    resources = local.microvm_image_resource_arns
  }
}

data "aws_iam_policy_document" "scale_set_pass_runner_execution_role" {
  statement {
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [var.runner.iam.role.arn]
  }
}

data "aws_iam_policy_document" "scale_set_publish_runner_jit" {
  statement {
    effect = "Allow"
    actions = [
      "ssm:DeleteParameter",
      "ssm:PutParameter",
    ]
    resources = [local.scale_set_runner_token_arn]
  }
}

data "aws_iam_policy_document" "scale_set_manage_microvm_metadata" {
  statement {
    effect = "Allow"
    actions = [
      "ssm:AddTagsToResource",
      "ssm:DeleteParameter",
      "ssm:GetParametersByPath",
      "ssm:PutParameter",
    ]
    resources = [
      local.microvm_metadata_path_arn,
      local.microvm_metadata_parameter_arn,
    ]
  }
}

locals {
  scale_set_runner_token_path = format(
    "/%s/%s",
    trim(var.storage_provider.aws.ssm.paths.root, "/"),
    trim(var.storage_provider.aws.ssm.paths.tokens, "/"),
  )
  scale_set_runner_token_arn = "${local.ssm_parameter_arn_prefix}${local.scale_set_runner_token_path}/*"

  scale_set_capability = {
    configuration_json = jsonencode({
      region              = var.aws_region
      environment         = var.prefix
      imageArn            = var.config.image_arn
      imageVersion        = var.config.image_version
      executionRoleArn    = var.runner.iam.role.arn
      ingressConnectors   = var.config.ingress_network_connectors
      egressConnectors    = var.config.egress_network_connectors
      runnerConfigSsmPath = local.ssm_config_ssm_path
      runnerTokenSsmPath  = local.scale_set_runner_token_path
      metadataSsmPath     = local.microvm_metadata_ssm_path
      runnerNamePrefix    = var.runner.name_prefix
      ssmParameterTags = [
        for key in sort(keys(local.ssm_parameter_tags)) : {
          Key   = key
          Value = local.ssm_parameter_tags[key]
        }
      ]
    })
    environment_variables = {}
    iam_statements = {
      list_microvms = {
        actions    = toset(data.aws_iam_policy_document.scale_set_list_microvms.statement[0].actions)
        resources  = toset(data.aws_iam_policy_document.scale_set_list_microvms.statement[0].resources)
        conditions = []
      }
      pass_network_connectors = {
        actions    = toset(data.aws_iam_policy_document.scale_set_pass_network_connectors.statement[0].actions)
        resources  = toset(data.aws_iam_policy_document.scale_set_pass_network_connectors.statement[0].resources)
        conditions = []
      }
      launch_microvms = {
        actions    = toset(data.aws_iam_policy_document.scale_set_launch_microvms.statement[0].actions)
        resources  = toset(data.aws_iam_policy_document.scale_set_launch_microvms.statement[0].resources)
        conditions = []
      }
      terminate_microvms = {
        actions    = toset(data.aws_iam_policy_document.scale_set_terminate_microvms.statement[0].actions)
        resources  = toset(data.aws_iam_policy_document.scale_set_terminate_microvms.statement[0].resources)
        conditions = []
      }
      pass_runner_execution_role = {
        actions    = toset(data.aws_iam_policy_document.scale_set_pass_runner_execution_role.statement[0].actions)
        resources  = toset(data.aws_iam_policy_document.scale_set_pass_runner_execution_role.statement[0].resources)
        conditions = []
      }
      publish_runner_jit = {
        actions    = toset(data.aws_iam_policy_document.scale_set_publish_runner_jit.statement[0].actions)
        resources  = toset(data.aws_iam_policy_document.scale_set_publish_runner_jit.statement[0].resources)
        conditions = []
      }
      manage_microvm_metadata = {
        actions    = toset(data.aws_iam_policy_document.scale_set_manage_microvm_metadata.statement[0].actions)
        resources  = toset(data.aws_iam_policy_document.scale_set_manage_microvm_metadata.statement[0].resources)
        conditions = []
      }
    }
  }
}
