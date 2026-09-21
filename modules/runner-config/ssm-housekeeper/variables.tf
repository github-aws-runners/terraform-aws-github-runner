variable "config" {
  description = <<-EOT
    Provider-neutral SSM housekeeper configuration assembled by runner-config.

    - `prefix`: Prefix used to name the housekeeper resources.
    - `aws_partition`: AWS partition used to construct IAM policy ARNs.
    - `schedule.expression`: EventBridge schedule expression that invokes the housekeeper.
    - `schedule.state`: State of the EventBridge rule.
    - `cleanup.token_path`: Parameter Store token path supplied to the Lambda.
    - `cleanup.parameter_path_arn`: IAM resource ARN matching `cleanup.token_path`.
    - `cleanup.minimum_days_old`: Minimum parameter age before deletion.
    - `cleanup.dry_run`: Reports eligible parameters without deleting them when true.
    - `lambda.artifact.zip`: Resolved local control-plane archive.
    - `lambda.artifact.s3.bucket`: Optional S3 bucket containing the Lambda archive.
    - `lambda.artifact.s3.key`: Object key of the Lambda archive.
    - `lambda.artifact.s3.object_version`: Optional object version of the Lambda archive.
    - `lambda.runtime`: Runtime used by the housekeeper Lambda.
    - `lambda.architecture`: Instruction-set architecture used by the housekeeper Lambda.
    - `lambda.memory_size`: Memory allocated to the housekeeper Lambda.
    - `lambda.timeout`: Housekeeper Lambda timeout in seconds.
    - `lambda.vpc.subnet_ids`: Subnets used for Lambda VPC configuration.
    - `lambda.vpc.security_group_ids`: Security groups used for Lambda VPC configuration.
    - `lambda.role.path`: IAM path used for the housekeeper Lambda role.
    - `lambda.role.permissions_boundary`: Optional permissions boundary for the housekeeper role.
    - `lambda.role.principals`: Additional principals allowed to assume the housekeeper Lambda role.
    - `observability.logs`: Logging level, retention, encryption, and log-class configuration.
    - `observability.tracing`: Lambda X-Ray and tracing-helper configuration.
    - `tags.resources`: Tags for the housekeeper role and EventBridge rule.
    - `tags.lambda`: Tags for the housekeeper Lambda function.
    - `tags.log_group`: Tags for the housekeeper log group.
  EOT

  type = object({
    prefix        = string
    aws_partition = string
    schedule = object({
      expression = string
      state      = string
    })
    cleanup = object({
      token_path         = string
      parameter_path_arn = string
      minimum_days_old   = number
      dry_run            = bool
    })
    lambda = object({
      artifact = object({
        zip = string
        s3 = object({
          bucket         = optional(string, null)
          key            = optional(string, null)
          object_version = optional(string, null)
        })
      })
      runtime      = string
      architecture = string
      memory_size  = number
      timeout      = number
      vpc = object({
        subnet_ids         = list(string)
        security_group_ids = list(string)
      })
      role = object({
        path                 = string
        permissions_boundary = optional(string, null)
        principals = optional(list(object({
          type        = string
          identifiers = list(string)
        })), [])
      })
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
    })
    tags = object({
      resources = map(string)
      lambda    = map(string)
      log_group = map(string)
    })
  })

  nullable = false
}
