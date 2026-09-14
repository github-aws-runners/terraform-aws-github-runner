variable "config" {
  description = <<-EOF
    Configuration passed from the webhook orchestration provider to the pool Lambda and scheduler.

    - `lambda`: Pool Lambda runtime and deployment configuration.
    - `lambda.log_level`: Logging level used by the pool Lambda.
    - `lambda.logging_retention_in_days`: Number of days to retain events in the pool Lambda log group.
    - `lambda.logging_kms_key_id`: KMS key ID used to encrypt the pool Lambda log group.
    - `lambda.log_class`: CloudWatch Logs class for the pool Lambda log group.
    - `lambda.reserved_concurrent_executions`: Reserved concurrency for the pool Lambda. Use -1 for no reservation.
    - `lambda.s3_bucket`: S3 bucket containing the pool Lambda deployment package.
    - `lambda.s3_key`: S3 key of the pool Lambda deployment package.
    - `lambda.s3_object_version`: S3 object version of the pool Lambda deployment package.
    - `lambda.security_group_ids`: Security group IDs associated with the pool Lambda.
    - `lambda.runtime`: AWS Lambda runtime used by the pool Lambda.
    - `lambda.architecture`: AWS Lambda architecture used by the pool Lambda.
    - `lambda.memory_size`: Memory allocated to the pool Lambda in MB.
    - `lambda.timeout`: Pool Lambda timeout in seconds.
    - `lambda.zip`: Local path to the pool Lambda deployment package when S3 is not used.
    - `lambda.subnet_ids`: Subnet IDs in which the pool Lambda runs.
    - `lambda.principals`: Additional principals allowed to assume the pool Lambda role.
    - `tags`: Common tags added to pool resources.
    - `ghes`: GitHub Enterprise Server connection configuration.
    - `ghes.url`: GitHub Enterprise Server URL; null when using public GitHub.
    - `ghes.ssl_verify`: Whether the pool Lambda verifies the GitHub Enterprise Server TLS certificate.
    - `github_app_parameters`: SSM parameter metadata for the primary and additional GitHub App credentials.
    - `github_app_parameters.key_base64`: Parameter Store reference for the primary GitHub App private key.
    - `github_app_parameters.id`: Parameter Store reference for the primary GitHub App ID.
    - `github_app_parameters.additional_apps_manifest`: Optional Parameter Store reference containing the additional GitHub App manifest.
    - `github_app_parameters.additional_app_parameter_arns`: ARNs of the additional GitHub App credential parameters.
    - `runner`: Runner registration configuration used by the pool Lambda.
    - `runner.disable_runner_autoupdate`: Whether GitHub runner automatic updates are disabled.
    - `runner.ephemeral`: Whether runners register as ephemeral runners.
    - `runner.enable_jit_config`: Whether runners use just-in-time registration configuration.
    - `runner.labels`: Labels assigned to runners created by the pool Lambda.
    - `runner.group_name`: GitHub runner group assigned to runners created by the pool Lambda.
    - `runner.name_prefix`: Prefix used for runner names.
    - `runner.pool_owner`: GitHub organization or repository that owns the runner pool.
    - `runner.boot_time_in_minutes`: Webhook-provider runner boot timeout used by pool reconciliation.
    - `runners_maximum_count`: Webhook-provider runner capacity limit enforced by the pool Lambda.
    - `prefix`: Prefix used to name pool resources.
    - `pool`: Scheduled pool targets.
    - `pool[*].schedule_expression`: EventBridge Scheduler expression for a pool target.
    - `pool[*].schedule_expression_timezone`: Time zone used to evaluate the schedule expression.
    - `pool[*].size`: Desired runner count for the scheduled pool target.
    - `include_busy_runners`: Whether busy runners count toward the desired pool size.
    - `role_permissions_boundary`: Permissions boundary applied to IAM roles created for the pool.
    - `role_path`: IAM path applied to roles created for the pool.
    - `lambda_tags`: Tags added specifically to the pool Lambda function, overriding common tags with the same key.
    - `log_group_tags`: Tags added specifically to the pool Lambda log group, overriding common tags with the same key.
    - `user_agent`: User-Agent header used for GitHub API requests.
  EOF
  type = object({
    enable_multi_org_runners = optional(bool, false)
    lambda = object({
      log_level                      = string
      logging_retention_in_days      = number
      logging_kms_key_id             = string
      log_class                      = string
      reserved_concurrent_executions = number
      s3_bucket                      = string
      s3_key                         = string
      s3_object_version              = string
      security_group_ids             = list(string)
      runtime                        = string
      architecture                   = string
      memory_size                    = number
      timeout                        = number
      zip                            = string
      subnet_ids                     = list(string)
      principals = optional(list(object({
        type        = string
        identifiers = list(string)
      })), [])
    })
    tags = map(string)
    ghes = object({
      url        = string
      ssl_verify = string
    })
    github_app_parameters = object({
      key_base64 = map(string)
      id         = map(string)
      additional_apps_manifest = optional(object({
        name = string
        arn  = string
      }), null)
      additional_app_parameter_arns = optional(list(string), [])
    })
    runner = object({
      disable_runner_autoupdate = bool
      ephemeral                 = bool
      enable_jit_config         = bool
      labels                    = list(string)
      group_name                = string
      name_prefix               = string
      pool_owner                = string
      boot_time_in_minutes      = number
    })
    runners_maximum_count = number
    prefix                = string
    pool = list(object({
      schedule_expression          = string
      schedule_expression_timezone = string
      org                          = optional(string)
      size                         = number
    }))
    include_busy_runners      = bool
    role_permissions_boundary = string
    role_path                 = string
    lambda_tags               = map(string)
    log_group_tags            = optional(map(string), {})
    user_agent                = string
  })

  validation {
    condition = !var.config.enable_multi_org_runners || alltrue([
      for pool in var.config.pool : can(regex("^[a-zA-Z0-9][a-zA-Z0-9-]*$", pool.org == null ? var.config.runner.pool_owner : pool.org))
    ])
    error_message = "Multi-org pools require an organization login in each schedule's org or the default pool owner."
  }
}

variable "runner_provider" {
  description = <<-EOF
    Compute provider integration used by the pool Lambda.

    - `type`: Compute provider type passed to scheduled pool invocations.
    - `environment_variables`: Provider-specific environment variables added to the pool Lambda.
    - `iam_policy_json`: Provider-specific IAM policy document merged into the pool Lambda policy.
    - `managed_policy_enabled`: Whether to attach a provider-specific managed IAM policy to the pool Lambda role.
    - `managed_policy_arn`: ARN of the provider-specific managed IAM policy to attach when enabled.
  EOF
  type = object({
    type                   = string
    environment_variables  = map(string)
    iam_policy_json        = string
    managed_policy_enabled = bool
    managed_policy_arn     = optional(string, null)
  })
}

variable "storage_provider" {
  description = "Resolved storage-provider configuration and capability used by the pool Lambda."
  type = object({
    aws = object({
      ssm = object({
        token_path           = string
        token_path_arn       = string
        config_path          = string
        config_path_arn      = string
        kms_key_id           = optional(string, null)
        parameter_store_tags = string
      })
    })
    environment_variables = optional(map(string), {})
    iam_policy_json       = optional(string, null)
  })
  nullable = false
}

variable "aws_partition" {
  description = "(optional) partition for the arn if not 'aws'"
  type        = string
  default     = "aws"
}

variable "tracing_config" {
  description = <<-EOF
    Tracing configuration for the pool Lambda.

    - `mode`: AWS X-Ray tracing mode. A null value disables tracing.
    - `capture_http_requests`: Whether Powertools tracing captures outgoing HTTP requests.
    - `capture_error`: Whether Powertools tracing captures errors as tracing metadata.
  EOF
  type = object({
    mode                  = optional(string, null)
    capture_http_requests = optional(bool, false)
    capture_error         = optional(bool, false)
  })
  default = {}
}
