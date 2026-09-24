locals {
  # Storage-provider capabilities are empty for SSM. The capability boundary
  # remains here so a future provider can add environment variables and IAM
  # policy fragments without changing the runner wiring.
  storage_provider_capabilities = {
    webhook = {
      direct = {
        environment_variables = tomap({})
        iam_policy_json       = null
      }
      eventbridge = {
        webhook = {
          environment_variables = tomap({})
          iam_policy_json       = null
        }
        dispatcher = {
          environment_variables = tomap({})
          iam_policy_json       = null
        }
      }
    }
    entries = {
      for entry_id in keys(local.effective_config.multi_runner_config) : entry_id => {
        scale_up = {
          environment_variables = tomap({})
          iam_policy_json       = null
        }
        scale_down = {
          environment_variables = tomap({})
          iam_policy_json       = null
        }
        pool = {
          environment_variables = tomap({})
          iam_policy_json       = null
        }
        job_retry = {
          environment_variables = tomap({})
          iam_policy_json       = null
        }
      }
    }
  }
}
