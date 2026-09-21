# Global defaults shared by all runner lanes.
variable "global_config" {
  description = <<-EOT
    Global defaults shared by all runner lanes.

    global_config = {
      tags: "Tags applied to resources created for all runner lanes."
      roles: {
        path: "IAM path used for roles created for runner resources."
        permissions_boundary: "Optional IAM permissions boundary ARN applied to created roles."
      }
      runner: {
        os: "Default operating system for runners."
        architecture: "Default runner architecture."
        disable_default_labels: "Whether to omit the default operating-system, architecture, and self-hosted labels."
        extra_labels: "Additional labels applied to all runners."
        group_name: "Default GitHub runner group."
        name_prefix: "Prefix for runner names."
        run_as_root: "Whether the GitHub Actions runner executes as root."
        run_as: "User that runs the GitHub Actions agent when it is not running as root."
        auto_update_disabled: "Whether automatic GitHub Actions runner updates are disabled."
        tags: "Tags applied to runner resources."
        hooks: {
          job_started: "Script executed when a job starts on a runner."
          job_completed: "Script executed when a job completes on a runner."
        }
        iam: {
          role.arn: "Existing IAM role ARN to use for runners."
          managed_policy_arns: "Managed policy ARNs attached to the runner IAM role."
          additional_trust_policy_json: "Additional trust policy JSON merged into the runner role trust policy."
          path: "IAM path used for the runner role."
          permissions_boundary: "Optional IAM permissions boundary ARN for the runner role."
        }
      }
    }
  EOT
  type = object({
    tags = optional(map(string), {})

    roles = optional(object({
      path                 = optional(string, null)
      permissions_boundary = optional(string, null)
    }), {})

    runner = optional(object({
      os                     = optional(string, null)
      architecture           = optional(string, null)
      disable_default_labels = optional(bool, false)
      extra_labels           = optional(list(string), [])
      group_name             = optional(string, "Default")
      name_prefix            = optional(string, "")
      run_as_root            = optional(bool, false)
      run_as                 = optional(string, "ec2-user")
      auto_update_disabled   = optional(bool, false)
      tags                   = optional(map(string), {})
      hooks = optional(object({
        job_started   = optional(string, "")
        job_completed = optional(string, "")
      }), {})
      iam = optional(object({
        role = optional(object({
          arn = string
        }), null)
        managed_policy_arns          = optional(map(string), {})
        additional_trust_policy_json = optional(string, null)
        path                         = optional(string, null)
        permissions_boundary         = optional(string, null)
      }), {})
    }), {})
  })
  default = {}
}

variable "global_config_storage_provider" {
  description = "Global runner-configuration storage provider selection. Omit the DynamoDB block to retain the existing SSM backend."
  type = object({
    aws = optional(object({
      dynamodb = optional(object({
        config = optional(object({
          kms_key_arn                    = optional(string, null)
          point_in_time_recovery_enabled = optional(bool, true)
          deletion_protection_enabled    = optional(bool, false)
          tags                           = optional(map(string), {})
        }), {})
        runner_state = optional(object({
          kms_key_arn                    = optional(string, null)
          point_in_time_recovery_enabled = optional(bool, false)
          deletion_protection_enabled    = optional(bool, false)
          runner_config_ttl_seconds      = optional(number, 86400)
          runner_state_ttl_seconds       = optional(number, 604800)
          tags                           = optional(map(string), {})
        }), {})
      }), null)
      ssm = optional(object({}), null)
    }), {})
  })
  default = {}

  validation {
    condition = (
      (try(var.global_config_storage_provider.aws.dynamodb, null) != null ? 1 : 0) +
      (try(var.global_config_storage_provider.aws.ssm, null) != null ? 1 : 0)
    ) <= 1
    error_message = "global_config_storage_provider must select at most one provider: aws.dynamodb or aws.ssm."
  }
}
