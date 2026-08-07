locals {
  selected_provider_types = [
    for provider_type, provider_config in var.compute_provider : provider_type
    if provider_config != null
  ]

  provider_type                  = length(local.selected_provider_types) == 1 ? local.selected_provider_types[0] : null
  provider_type_for_integrations = coalesce(local.provider_type, "invalid")

  empty_provider_policy_json = jsonencode({
    Version   = "2012-10-17"
    Statement = []
  })

  empty_provider = {
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
        iam_policy_json            = local.empty_provider_policy_json
        additional_iam_policy_json = null
        managed_policy_enabled     = false
        managed_policy_arn         = null
      }
      scale_down = {
        iam_policy_json = local.empty_provider_policy_json
      }
      pool = {
        iam_policy_json        = local.empty_provider_policy_json
        managed_policy_enabled = false
        managed_policy_arn     = null
      }
    }
  }

  provider_environment_variables = (
    local.provider_type == "ec2" ? one(module.ec2[*].environment_variables) :
    local.provider_type == "microvm" ? one(module.microvm[*].environment_variables) :
    local.empty_provider.environment_variables
  )

  provider_policies = (
    local.provider_type == "ec2" ? one(module.ec2[*].policies) :
    local.provider_type == "microvm" ? one(module.microvm[*].policies) :
    local.empty_provider.policies
  )

  provider = {
    environment_variables = local.provider_environment_variables
    policies              = local.provider_policies
  }
}
