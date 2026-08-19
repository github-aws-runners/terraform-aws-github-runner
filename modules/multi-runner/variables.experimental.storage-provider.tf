# Global storage-provider configuration.
variable "global_config_storage_provider" {
  description = <<-EOT
    Global storage-provider configuration shared by all runner lanes.

    global_config_storage_provider = {
      aws.ssm.paths.root: "Root path for SSM parameters."
      aws.ssm.paths.app: "Path segment for application parameters."
      aws.ssm.paths.webhook: "Path segment for webhook parameters."
      aws.ssm.paths.tokens: "Path segment for runner token parameters."
      aws.ssm.paths.config: "Path segment for runner configuration parameters."
      aws.ssm.kms_key_id: "KMS key ID used to encrypt SSM parameters."
      aws.ssm.tags: "Tags applied to SSM resources."
      aws.ssm.parameters.tags: "Tags applied to runner configuration parameters."
      aws.ssm.housekeeper.schedule_expression: "Schedule for the SSM parameter housekeeper."
      aws.ssm.housekeeper.state: "EventBridge rule state for the SSM housekeeper."
      aws.ssm.housekeeper.tags: "Tags applied to the SSM housekeeper resources."
      aws.ssm.housekeeper.lambda.artifact.zip: "Local ZIP artifact used for the SSM housekeeper Lambda."
      aws.ssm.housekeeper.lambda.artifact.s3.key: "S3 object key for the SSM housekeeper Lambda."
      aws.ssm.housekeeper.lambda.artifact.s3.object_version: "Optional S3 object version for the SSM housekeeper artifact."
      aws.ssm.housekeeper.lambda.memory_size: "Memory allocated to the SSM housekeeper Lambda."
      aws.ssm.housekeeper.lambda.timeout: "Timeout in seconds for the SSM housekeeper Lambda."
      aws.ssm.housekeeper.config.tokenPath: "Parameter path containing runner tokens to clean up."
      aws.ssm.housekeeper.config.minimumDaysOld: "Minimum age in days before an old token is eligible for cleanup."
      aws.ssm.housekeeper.config.dryRun: "Whether the SSM housekeeper reports cleanup without deleting parameters."
      aws.dynamodb.config.kms_key_arn: "Optional customer-managed KMS key ARN for the durable configuration table."
      aws.dynamodb.config.point_in_time_recovery_enabled: "Enables point-in-time recovery for the durable configuration table."
      aws.dynamodb.config.deletion_protection_enabled: "Enables deletion protection for the durable configuration table."
      aws.dynamodb.config.tags: "Tags applied to the durable configuration table."
      aws.dynamodb.runner_state.kms_key_arn: "Optional customer-managed KMS key ARN for the runner-state table."
      aws.dynamodb.runner_state.point_in_time_recovery_enabled: "Enables point-in-time recovery for the runner-state table."
      aws.dynamodb.runner_state.deletion_protection_enabled: "Enables deletion protection for the runner-state table."
      aws.dynamodb.runner_state.runner_config_ttl_seconds: "TTL in seconds for one-time registration and JIT configuration records."
      aws.dynamodb.runner_state.runner_state_ttl_seconds: "Safety TTL in seconds for provisioning and terminating lifecycle records."
      aws.dynamodb.runner_state.tags: "Tags applied to the runner-state table."
    }

    Setting aws.dynamodb moves runner configuration, GitHub App credentials, the webhook secret and the runner matcher
    configuration to DynamoDB. Omitting it keeps the SSM backend; aws.ssm continues to supply paths for remaining SSM resources.
  EOT
  type = object({
    aws = optional(object({
      ssm = optional(object({
        paths = optional(object({
          root    = optional(string, null)
          app     = optional(string, "app")
          webhook = optional(string, "webhook")
          tokens  = optional(string, "runners/tokens")
          config  = optional(string, "runners/config")
        }), {})
        kms_key_id = optional(string, null)
        tags       = optional(map(string), {})
        parameters = optional(object({
          tags = optional(map(string), {})
        }), {})
        housekeeper = optional(object({
          schedule_expression = optional(string, "rate(1 day)")
          state               = optional(string, "ENABLED")
          tags                = optional(map(string), {})
          lambda = optional(object({
            artifact = optional(object({
              zip = optional(string, null)
              s3 = optional(object({
                key            = string
                object_version = optional(string, null)
              }), null)
            }), {})
            memory_size = optional(number, 512)
            timeout     = optional(number, 60)
          }), {})
          config = optional(object({
            tokenPath      = optional(string, null)
            minimumDaysOld = optional(number, 1)
            dryRun         = optional(bool, false)
          }), {})
        }), {})
      }), {})
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
    }), {})
  })
  default = {}
}
