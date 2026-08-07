variable "config" {
  description = <<-EOT
    Provider-neutral job-retry configuration assembled by runner-stack.

    - `prefix`: Prefix used to name job-retry resources.
    - `aws_partition`: AWS partition used to construct the Lambda VPC managed-policy ARN.
    - `lambda.artifact.zip`: Resolved local control-plane archive.
    - `lambda.artifact.s3.bucket`: Optional S3 bucket containing the Lambda archive.
    - `lambda.artifact.s3.key`: Object key of the Lambda archive.
    - `lambda.artifact.s3.object_version`: Optional object version of the Lambda archive.
    - `lambda.runtime`: Runtime used by the job-retry Lambda.
    - `lambda.architecture`: Instruction-set architecture used by the job-retry Lambda.
    - `lambda.memory_size`: Memory allocated to the job-retry Lambda.
    - `lambda.timeout`: Lambda timeout and retry-queue visibility timeout in seconds.
    - `lambda.reserved_concurrent_executions`: Reserved concurrency for the Lambda. Use `-1` for unreserved concurrency.
    - `lambda.environment_variables`: Additional Lambda environment variables. Required job-retry variables override matching keys.
    - `lambda.vpc.subnet_ids`: Subnets used for Lambda VPC configuration.
    - `lambda.vpc.security_group_ids`: Security groups used for Lambda VPC configuration.
    - `lambda.role.path`: IAM path used for the job-retry Lambda role.
    - `lambda.role.permissions_boundary`: Optional permissions boundary for the Lambda role.
    - `lambda.role.principals`: Extra principals allowed to assume the Lambda role, for example during local testing.
    - `runner.name_prefix`: Prefix used to identify runners belonging to this runner configuration.
    - `github.organization_runners`: Enables organization runners.
    - `github.enterprise_server.url`: Optional GitHub Enterprise Server URL.
    - `github.user_agent`: Optional User-Agent sent to GitHub.
    - `github.app_parameters.key_base64`: Name and ARN of the GitHub App private-key parameter.
    - `github.app_parameters.id`: Name and ARN of the GitHub App ID parameter.
    - `queue.build`: URL and ARN of the build queue to which retry messages are published.
    - `queue.event_source_mapping.batch_size`: Maximum records delivered per job-retry invocation.
    - `queue.event_source_mapping.maximum_batching_window_in_seconds`: Maximum event batching window.
    - `queue.encryption`: Server-side encryption configuration for the retry queue.
    - `ssm.kms_key`: Optional KMS key used by the job-retry IAM policy.
    - `observability.logs`: Logging level, retention, encryption, and log-class configuration.
    - `observability.tracing`: Lambda X-Ray and tracing-helper configuration.
    - `observability.metrics`: Metrics enablement, namespace, and job-retry metric configuration.
    - `tags.resources`: Tags for the job-retry Lambda role and component resources.
    - `tags.lambda`: Tags for the job-retry Lambda function.
    - `tags.log_group`: Tags for the job-retry log group.
    - `tags.queue`: Tags for the retry queue.
    - `tags.event_source_mapping`: Tags for the retry-queue event-source mapping.
  EOT

  type = object({
    prefix        = string
    aws_partition = string
    lambda = object({
      artifact = object({
        zip = string
        s3 = object({
          bucket         = optional(string, null)
          key            = optional(string, null)
          object_version = optional(string, null)
        })
      })
      runtime                        = string
      architecture                   = string
      memory_size                    = number
      timeout                        = number
      reserved_concurrent_executions = number
      environment_variables          = map(string)
      vpc = object({
        subnet_ids         = list(string)
        security_group_ids = list(string)
      })
      role = object({
        path                 = string
        permissions_boundary = optional(string, null)
        principals = list(object({
          type        = string
          identifiers = list(string)
        }))
      })
    })
    runner = object({
      name_prefix = string
    })
    github = object({
      organization_runners = bool
      enterprise_server = object({
        url = optional(string, null)
      })
      user_agent = optional(string, null)
      app_parameters = object({
        key_base64 = object({
          name = string
          arn  = string
        })
        id = object({
          name = string
          arn  = string
        })
      })
    })
    queue = object({
      build = object({
        url = string
        arn = string
      })
      event_source_mapping = object({
        batch_size                         = number
        maximum_batching_window_in_seconds = number
      })
      encryption = object({
        sqs_managed_sse_enabled           = bool
        kms_master_key_id                 = optional(string, null)
        kms_data_key_reuse_period_seconds = optional(number, null)
      })
    })
    ssm = object({
      kms_key = optional(object({
        arn = string
      }), null)
    })
    observability = object({
      logs = object({
        level             = string
        retention_in_days = number
        kms_key_id        = optional(string, null)
        class             = string
      })
      tracing = object({
        mode                  = optional(string, null)
        capture_http_requests = bool
        capture_error         = bool
      })
      metrics = object({
        enable    = bool
        namespace = string
        metric = object({
          enable_github_app_rate_limit = bool
          enable_job_retry             = bool
        })
      })
    })
    tags = object({
      resources            = map(string)
      lambda               = map(string)
      log_group            = map(string)
      queue                = map(string)
      event_source_mapping = map(string)
    })
  })

  nullable = false

  validation {
    condition     = contains(["arm64", "x86_64"], var.config.lambda.architecture)
    error_message = "config.lambda.architecture must be arm64 or x86_64."
  }

  validation {
    condition = contains([
      "silly",
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
    ], var.config.observability.logs.level)
    error_message = "config.observability.logs.level must be one of silly, trace, debug, info, warn, error, or fatal."
  }

  validation {
    condition     = length(var.config.prefix) + length("job-retry") <= 63
    error_message = "The length of config.prefix plus job-retry must be less than or equal to 63."
  }
}
