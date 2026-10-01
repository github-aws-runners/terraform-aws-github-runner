# Provider-owned runtime and IAM fragments for the additive scale-set
# orchestration capability. GitHub credentials, GitHub scope, desired capacity,
# and boot timeout remain orchestration-owned and are not serialized here.
locals {
  scale_set_runner_token_path = format(
    "/%s/%s",
    trim(var.storage_provider.aws.ssm.paths.root, "/"),
    trim(var.storage_provider.aws.ssm.paths.tokens, "/"),
  )
  scale_set_runner_token_arn = "${local.ssm_parameter_arn_prefix}${local.scale_set_runner_token_path}/*"

  scale_set_iam_statements = {
    list_microvms = {
      actions    = toset(["lambda:ListMicrovms"])
      resources  = toset(["*"])
      conditions = []
    }
    pass_network_connectors = {
      actions    = toset(["lambda:PassNetworkConnector"])
      resources  = toset(["*"])
      conditions = []
    }
    launch_microvms = {
      actions = toset([
        "lambda:RunMicrovm",
      ])
      resources  = toset(local.microvm_image_resource_arns)
      conditions = []
    }
    terminate_microvms = {
      actions    = toset(["lambda:TerminateMicrovm"])
      resources  = toset(local.microvm_image_resource_arns)
      conditions = []
    }
    pass_runner_execution_role = {
      actions    = toset(["iam:PassRole"])
      resources  = toset([var.runner.iam.role.arn])
      conditions = []
    }
    publish_runner_jit = {
      actions = toset([
        "ssm:DeleteParameter",
        "ssm:PutParameter",
      ])
      resources  = toset([local.scale_set_runner_token_arn])
      conditions = []
    }
    manage_microvm_metadata = {
      actions = toset([
        "ssm:AddTagsToResource",
        "ssm:DeleteParameter",
        "ssm:GetParametersByPath",
        "ssm:PutParameter",
      ])
      resources = toset([
        local.microvm_metadata_path_arn,
        local.microvm_metadata_parameter_arn,
      ])
      conditions = []
    }
  }

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
    iam_statements        = local.scale_set_iam_statements
  }
}
