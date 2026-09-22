# Global storage-provider configuration.
variable "global_storage_provider" {
  description = <<-EOT
    Global storage-provider configuration shared by all runner lanes.

    global_storage_provider = {
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
    }
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
    }), {})
  })
  default = {}
}
