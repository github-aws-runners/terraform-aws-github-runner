locals {
  compute_providers = {
    aws_ec2 = var.compute_provider.aws.ec2
  }

  discovered_provider_key = one([
    for provider_key, provider_config in local.compute_providers : provider_key
    if provider_config != null
  ])
  provider_key = var.compute_provider_key != null ? var.compute_provider_key : local.discovered_provider_key

  provider_types = {
    aws_ec2 = "ec2"
  }

  provider_type = try(local.provider_types[local.provider_key], null)

  provider_assume_role_policies = {
    aws_ec2 = try(module.compute_aws_ec2_trust_policy[0].assume_role_policy, null)
  }

  provider_assume_role_policy = try(local.provider_assume_role_policies[local.provider_key], null)

  empty_provider_contract = {
    type         = null
    capabilities = { scale_set = null }
    environment_variables = {
      scale_up   = {}
      scale_down = {}
      pool       = {}
    }
    policies = {
      runner = {
        inline_policies     = {}
        managed_policy_arns = {}
      }
      scale_up = {
        iam_policy_json            = null
        additional_iam_policy_json = null
        managed_policy_enabled     = false
        managed_policy_arn         = null
      }
      scale_down = {
        iam_policy_json = null
      }
      pool = {
        iam_policy_json        = null
        managed_policy_enabled = false
        managed_policy_arn     = null
      }
    }
    resources = null
  }

  provider_contracts = {
    aws_ec2 = one(module.compute_aws_ec2[*].provider)
  }

  # Keep invalid or empty selections evaluable long enough for validate_config
  # to report the exact-one contract error.
  provider_contract = local.provider_key == null ? local.empty_provider_contract : local.provider_contracts[local.provider_key]
}
