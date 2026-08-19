variable "storage_provider" {
  description = <<-EOT
    Selected runner-configuration storage provider and its opaque capability contracts.

    The runner-config module forwards Lambda environment and IAM additions to the orchestration provider and the runner bootstrap locator/IAM policy to the selected compute provider. Consumers do not inspect provider-specific environment keys or IAM statements.
  EOT
  type = object({
    type = string
    scale_up = object({
      environment_variables = map(string)
      iam_policy_json       = optional(string, null)
    })
    scale_down = object({
      environment_variables = map(string)
      iam_policy_json       = optional(string, null)
    })
    pool = object({
      environment_variables = map(string)
      iam_policy_json       = optional(string, null)
    })
    job_retry = object({
      environment_variables = map(string)
      iam_policy_json       = optional(string, null)
    })
    runner = object({
      config_table_name       = optional(string, null)
      runner_state_table_name = optional(string, null)
      scope                   = optional(string, null)
      iam_policy_json         = optional(string, null)
    })
  })
  default = {
    type = "aws_ssm"
    scale_up = {
      environment_variables = {}
      iam_policy_json       = null
    }
    scale_down = {
      environment_variables = {}
      iam_policy_json       = null
    }
    pool = {
      environment_variables = {}
      iam_policy_json       = null
    }
    job_retry = {
      environment_variables = {}
      iam_policy_json       = null
    }
    runner = {
      config_table_name       = null
      runner_state_table_name = null
      scope                   = null
      iam_policy_json         = null
    }
  }
}
