variable "aws_partition" {
  description = "AWS partition used to construct IAM ARNs."
  type        = string
  default     = "aws"
}

variable "aws_region" {
  description = "AWS region used by compute-provider resources and policy documents."
  type        = string
}

variable "prefix" {
  description = "Prefix used to identify resources created for the runner stack."
  type        = string
  default     = "github-actions"
}

variable "tags" {
  description = "Base tags available to taggable compute-provider resources. Provider-specific tags override this map within their documented scopes."
  type        = map(string)
  default     = {}
}

variable "config" {
  description = <<-EOT
    Lambda MicroVM compute-provider configuration. Paths match `compute_provider.microvm` in the runner stack.

    - `image_identifier`: ARN or ID of the MicroVM image used to run GitHub runners.
    - `image_version`: Optional MicroVM image version.
    - `execution_role`: Optional externally managed execution role assumed by MicroVMs. Null uses the common runner role.
    - `execution_role.arn`: ARN of the externally managed MicroVM execution role.
    - `runner_role_trust_services`: Service principals trusted by the common runner role when it is used as the MicroVM execution role.
    - `egress_network_connectors`: Egress network connectors passed to RunMicrovm.
    - `idle_policy`: Optional auto-suspend and auto-resume configuration passed to RunMicrovm.
    - `idle_policy.max_idle_duration_seconds`: Maximum idle time before MicroVM auto-suspend.
    - `idle_policy.suspended_duration_seconds`: Maximum suspended time before MicroVM termination.
    - `idle_policy.auto_resume_enabled`: Enables automatic resume on inbound traffic while suspended.
    - `logging`: Optional RunMicrovm logging union. Exactly one of `cloud_watch` or `disabled` must be selected when set.
    - `logging.cloud_watch.log_group`: Optional CloudWatch Logs log group used by MicroVM runtime logs.
    - `logging.cloud_watch.log_stream`: Optional CloudWatch Logs log stream used by MicroVM runtime logs.
    - `logging.disabled`: Disables MicroVM runtime logging when true.
    - `run_hook_payload`: Optional payload delivered to the MicroVM `/run` hook. Maximum 16,384 characters.
    - `maximum_duration_in_seconds`: Optional maximum MicroVM lifetime. Valid range is 1 through 28,800 seconds.
    - `environment_variables`: Additional provider-specific Lambda environment variables merged into scale-up, scale-down, and pool.
    - `tags`: Tags encoded into the MicroVM runner configuration.
    - `iam.resource_arns`: Resource ARNs used by the generated MicroVM control-plane policies. The service is new and some actions may require `*`.
    - `iam.actions.scale_up`: MicroVM IAM actions used by scale-up and pool.
    - `iam.actions.scale_down`: MicroVM IAM actions used by scale-down.
    - `iam.additional_policy_json.scale_up`: Optional additional provider policy attached separately to the scale-up Lambda role.
    - `iam.managed_policy_arns.scale_up`: Optional managed policy attached to the scale-up Lambda role.
    - `iam.managed_policy_arns.pool`: Optional managed policy attached to the pool Lambda role.
  EOT

  type = object({
    image_identifier = string
    image_version    = optional(string, null)
    execution_role = optional(object({
      arn = string
    }), null)
    runner_role_trust_services = optional(list(string), ["lambda.amazonaws.com"])
    egress_network_connectors  = optional(list(string), [])
    idle_policy = optional(object({
      max_idle_duration_seconds  = number
      suspended_duration_seconds = number
      auto_resume_enabled        = bool
    }), null)
    logging = optional(object({
      cloud_watch = optional(object({
        log_group  = optional(string, null)
        log_stream = optional(string, null)
      }), null)
      disabled = optional(bool, false)
    }), null)
    run_hook_payload            = optional(string, null)
    maximum_duration_in_seconds = optional(number, null)
    environment_variables       = optional(map(string), {})
    tags                        = optional(map(string), {})
    iam = optional(object({
      resource_arns = optional(list(string), ["*"])
      actions = optional(object({
        scale_up   = optional(list(string), null)
        scale_down = optional(list(string), null)
      }), {})
      additional_policy_json = optional(object({
        scale_up = optional(string, null)
      }), {})
      managed_policy_arns = optional(object({
        scale_up = optional(string, null)
        pool     = optional(string, null)
      }), {})
    }), {})
  })

  nullable = false
}

variable "runner" {
  description = <<-EOT
    Provider-neutral runner settings consumed by compute providers.

    - `os`: Runner operating system. Supported values are `linux`, `osx`, and `windows`.
    - `architecture`: Runner distribution architecture.
    - `boot_time_in_minutes`: Expected boot and registration duration used by scale-down and pool.
    - `name_prefix`: Prefix added to registered runner names.
    - `run_as_root`: Runs the runner service as root.
    - `run_as`: Operating-system user used when `run_as_root` is false.
    - `hooks.job_started`: Script installed as the runner job-started hook.
    - `hooks.job_completed`: Script installed as the runner job-completed hook.
    - `iam.role.arn`: Resolved runner-role ARN referenced by provider policies and resources.
    - `iam.role.name`: Resolved runner-role name used by provider resources.
    - `iam.role.managed`: Whether runner-stack manages the resolved runner role.
    - `iam.path`: IAM path available to provider-managed IAM resources. Null derives the path from `prefix`.
  EOT
  type = object({
    os                   = optional(string, "linux")
    architecture         = optional(string, "x64")
    boot_time_in_minutes = optional(number, 5)
    name_prefix          = optional(string, "")
    run_as_root          = optional(bool, false)
    run_as               = optional(string, "ec2-user")
    hooks = optional(object({
      job_started   = optional(string, "")
      job_completed = optional(string, "")
    }), {})
    iam = object({
      role = object({
        arn     = string
        name    = string
        managed = optional(bool, true)
      })
      path = optional(string, null)
    })
  })

  nullable = false
}

# tflint-ignore: terraform_unused_declarations
variable "github" {
  description = <<-EOT
    GitHub Enterprise Server settings available to compute-provider bootstrap data.

    - `enterprise_server.url`: Optional GitHub Enterprise Server base URL. Null selects GitHub.com.
    - `enterprise_server.ssl_verify`: Enables TLS certificate verification for GitHub Enterprise Server.
  EOT
  type = object({
    enterprise_server = optional(object({
      url        = optional(string, null)
      ssl_verify = optional(bool, true)
    }), {})
  })
  default  = {}
  nullable = false
}

# tflint-ignore: terraform_unused_declarations
variable "ssm" {
  description = <<-EOT
    Parameter Store paths and tag scopes available to compute-provider bootstrap resources.

    - `paths.root`: Root Parameter Store path for the runner stack.
    - `paths.tokens`: Path segment used for registration tokens and just-in-time configuration.
    - `paths.config`: Path segment used for persistent runner and provider configuration.
    - `tags`: Shared SSM tags that override module-level `tags`.
    - `parameters.tags`: Parameter-specific tags that override module-level and shared SSM tags.
  EOT
  type = object({
    paths = object({
      root   = string
      tokens = string
      config = string
    })
    tags = optional(map(string), {})
    parameters = optional(object({
      tags = optional(map(string), {})
    }), {})
  })

  nullable = false
}

# tflint-ignore: terraform_unused_declarations
variable "observability" {
  description = <<-EOT
    CloudWatch Logs settings available to compute-provider runner log groups.

    - `logs.retention_in_days`: Retention period for provider-owned runner log groups.
    - `logs.kms_key_id`: Optional KMS key ID or ARN used to encrypt runner log groups.
    - `logs.tags`: Shared log-group tags that override module-level `tags`.
  EOT
  type = object({
    logs = optional(object({
      retention_in_days = optional(number, 180)
      kms_key_id        = optional(string, null)
      tags              = optional(map(string), {})
    }), {})
  })
  default  = {}
  nullable = false
}
