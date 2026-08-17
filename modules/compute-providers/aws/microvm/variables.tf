# tflint-ignore: terraform_unused_declarations
variable "aws_partition" {
  description = "AWS partition used to construct IAM ARNs."
  type        = string
  default     = "aws"
}

# tflint-ignore: terraform_unused_declarations
variable "aws_region" {
  description = "AWS region used by compute-provider resources and policy documents."
  type        = string
}

# tflint-ignore: terraform_unused_declarations
variable "prefix" {
  description = "Prefix used to identify resources created for the runner configuration."
  type        = string
  default     = "github-actions"
}

# tflint-ignore: terraform_unused_declarations
variable "tags" {
  description = "Base tags available to taggable compute-provider resources. Provider-specific tags override this map within their documented scopes."
  type        = map(string)
  default     = {}
}

variable "config" {
  description = <<-EOT
    Lambda MicroVM compute-provider configuration. Paths match `compute_provider.aws.microvm` in runner-config.

    - `image_arn`: ARN of the MicroVM image used to run GitHub runners.
    - `image_version`: Optional MicroVM image version.
    - `ingress_network_connectors`: Up to 10 Lambda network-connector ARNs passed to RunMicrovm.
    - `egress_network_connectors`: Up to 10 Lambda network-connector ARNs passed to RunMicrovm.
    - `maximum_duration_in_seconds`: Optional maximum MicroVM lifetime. Valid values are integers from 1 through 28,800 seconds.
    - `environment_variables`: Additional provider-specific Lambda environment variables merged into scale-up, scale-down, and pool.
    - `iam.resource_arns.images`: MicroVM image ARNs allowed by RunMicrovm. The default is `["*"]`.
    - `iam.resource_arns.microvms`: MicroVM instance ARNs allowed by tagging and termination actions. The default is `["*"]`. Provider-required list and connector permissions remain separately scoped to `*`.
    - `iam.additional_policy_json.scale_up`: Optional additional provider policy attached separately to the scale-up Lambda role.
    - `iam.managed_policies.scale_up`: Optional managed-policy wrapper attached to the scale-up Lambda role. Wrapper presence controls resource creation during planning.
    - `iam.managed_policies.scale_up.arn`: ARN of the scale-up managed policy. The ARN may remain unknown until apply.
    - `iam.managed_policies.pool`: Optional managed-policy wrapper attached to the pool Lambda role. Wrapper presence controls resource creation during planning.
    - `iam.managed_policies.pool.arn`: ARN of the pool managed policy. The ARN may remain unknown until apply.
  EOT

  type = object({
    image_arn                   = string
    image_version               = optional(string, null)
    ingress_network_connectors  = optional(list(string), [])
    egress_network_connectors   = optional(list(string), [])
    maximum_duration_in_seconds = optional(number, null)
    environment_variables       = optional(map(string), {})
    iam = optional(object({
      resource_arns = optional(object({
        images   = optional(list(string), ["*"])
        microvms = optional(list(string), ["*"])
      }), {})
      additional_policy_json = optional(object({
        scale_up = optional(string, null)
      }), {})
      managed_policies = optional(object({
        scale_up = optional(object({
          arn = string
        }), null)
        pool = optional(object({
          arn = string
        }), null)
      }), {})
    }), {})
  })

  nullable = false
}

variable "runner" {
  description = <<-EOT
    Resolved runner settings consumed by the Lambda MicroVM compute provider.

    - `os`: Runner operating system. Lambda MicroVM requires `linux`.
    - `architecture`: Runner distribution architecture. Lambda MicroVM requires `arm64`.
    - `name_prefix`: Prefix added to registered runner names.
    - `run_as_root`: Runs the runner service as root.
    - `run_as`: Operating-system user used when `run_as_root` is false.
    - `hooks.job_started`: Script installed as the runner job-started hook.
    - `hooks.job_completed`: Script installed as the runner job-completed hook.
    - `iam.role.arn`: Resolved runner-role ARN used as the MicroVM execution role and referenced by provider policies.
    - `iam.role.name`: Resolved runner-role name used by provider resources.
    - `iam.role.managed`: Whether runner-config manages the resolved runner role. Callers own an external role and must grant it `ssm:GetParameter` and `ssm:DeleteParameter` on the lane token path plus `logs:CreateLogStream` and `logs:PutLogEvents` on the provider-managed runtime log group.
    - `iam.managed_policy_arns`: Common managed-policy ARNs returned with the provider-specific runner policies for attachment by runner-config.
    - `iam.path`: IAM path available to provider-managed IAM resources. Null derives the path from `prefix`.
  EOT
  type = object({
    os           = optional(string, "linux")
    architecture = optional(string, "arm64")
    name_prefix  = optional(string, "")
    run_as_root  = optional(bool, false)
    run_as       = optional(string, "ec2-user")
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
      managed_policy_arns = optional(map(string), {})
      path                = optional(string, null)
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

    - `paths.root`: Root Parameter Store path for the runner configuration.
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

variable "observability" {
  description = <<-EOT
    Provider-neutral observability settings applied to the provider-managed MicroVM runtime log group.

    - `logs.retention_in_days`: CloudWatch Logs retention period.
    - `logs.kms_key_id`: Optional KMS key ID or ARN used to encrypt the log group.
    - `logs.class`: CloudWatch log-group class.
    - `logs.tags`: Tags merged after module-level tags on the log group.
  EOT
  type = object({
    logs = optional(object({
      retention_in_days = optional(number, 180)
      kms_key_id        = optional(string, null)
      class             = optional(string, "STANDARD")
      tags              = optional(map(string), {})
    }), {})
  })
  default  = {}
  nullable = false
}
