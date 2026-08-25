locals {
  orchestration_providers = {
    for provider_type, provider_config in var.orchestration_provider : provider_type => provider_config
    if provider_config != null
  }

  orchestration_provider_type = one(keys(local.orchestration_providers))

  orchestration_provider_enabled = {
    webhook   = local.orchestration_provider_type == "webhook"
    scale_set = local.orchestration_provider_type == "scale_set"
  }

  orchestration_provider_runner_lifecycle = {
    webhook = one(module.orchestration_webhook[*].runner_lifecycle)
    scale_set = {
      ephemeral          = true
      jit_config_enabled = true
    }
  }[local.orchestration_provider_type]

  scale_set_ec2_reserved_runner_tag_keys = toset([
    "ghr:Application",
    "ghr:created_by",
    "ghr:Type",
    "ghr:Owner",
    "ghr:runner_config",
    "ghr:scale_set_id",
    "ghr:github_scope_hash",
    "ghr:scale_set_state",
    "ghr:runner_name",
    "ghr:github_runner_id",
  ])

  scale_set_ec2_selected = (
    var.orchestration_provider.scale_set != null &&
    local.provider_key == "aws_ec2"
  )

  # The EC2 scale-set runtime serializes the same merged tags as the provider's
  # Parameter Store resources, including the generated Name tag.
  scale_set_ec2_ssm_parameter_tags = local.scale_set_ec2_selected ? merge(
    { Name = format("%s-action-runner", var.prefix) },
    var.tags,
    var.ssm.tags,
    var.ssm.parameters.tags,
  ) : {}

  scale_set_ec2_external_ami_parameter_arn = local.scale_set_ec2_selected ? try(
    var.compute_provider.aws.ec2.ami.id_ssm_parameter.arn,
    null,
  ) : null

  scale_set_ec2_external_ami_parameter_name = local.scale_set_ec2_external_ami_parameter_arn == null ? null : try(
    regex(
      "^arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter(/[A-Za-z0-9_.\\-/]+)$",
      local.scale_set_ec2_external_ami_parameter_arn,
    )[0],
    null,
  )
}

module "orchestration_webhook" {
  source = "../orchestration-providers/webhook"
  count  = local.orchestration_provider_enabled.webhook ? 1 : 0

  aws_partition = var.aws_partition
  prefix        = var.prefix
  tags          = var.tags

  config = var.orchestration_provider.webhook
  runner = var.runner
  github = var.github
  lambda = {
    artifact           = var.lambda.artifact
    runtime            = var.lambda.runtime
    architecture       = var.lambda.architecture
    subnet_ids         = var.lambda.subnet_ids
    security_group_ids = var.lambda.security_group_ids
    tags               = var.lambda.tags
    role = {
      path                 = local.lambda_role_path
      permissions_boundary = var.lambda.role.permissions_boundary
      principals           = var.lambda.principals
    }
  }
  ssm = {
    token_path           = local.token_path
    token_path_arn       = local.arn_ssm_parameters_path_tokens
    config_path          = "${var.ssm.paths.root}/${var.ssm.paths.config}"
    config_path_arn      = local.arn_ssm_parameters_path_config
    kms_key_id           = local.kms_key_id
    parameter_store_tags = local.parameter_store_tags
  }
  observability = var.observability

  runner_provider = {
    type = local.provider_type
    scale_up = {
      environment_variables      = local.provider_contract.environment_variables.scale_up
      iam_policy_json            = local.provider_contract.policies.scale_up.iam_policy_json
      additional_iam_policy_json = local.provider_contract.policies.scale_up.additional_iam_policy_json
      managed_policy = local.provider_contract.policies.scale_up.managed_policy_enabled ? {
        arn = local.provider_contract.policies.scale_up.managed_policy_arn
      } : null
    }
    scale_down = {
      environment_variables = local.provider_contract.environment_variables.scale_down
      iam_policy_json       = local.provider_contract.policies.scale_down.iam_policy_json
    }
    pool = {
      environment_variables  = local.provider_contract.environment_variables.pool
      iam_policy_json        = local.provider_contract.policies.pool.iam_policy_json
      managed_policy_enabled = local.provider_contract.policies.pool.managed_policy_enabled
      managed_policy_arn     = local.provider_contract.policies.pool.managed_policy_arn
    }
  }
}
