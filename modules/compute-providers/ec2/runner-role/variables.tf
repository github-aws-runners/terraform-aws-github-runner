variable "aws_partition" {
  description = "AWS partition used to build IAM and SSM ARNs."
  type        = string
  default     = "aws"
}

variable "aws_region" {
  description = "AWS region containing the runner configuration parameters."
  type        = string
}

variable "config" {
  description = <<-EOT
    EC2 configuration that controls provider-owned runner policies.

    - `cloudwatch_agent.enabled`: Includes the CloudWatch agent policy in the runner-role contract.
    - `binaries_syncer.enabled`: Includes access to the synchronized runner distribution.
    - `binaries_syncer.s3`: S3 object containing the runner distribution. Required when synchronization is enabled.
    - `binaries_syncer.s3.arn`: ARN of the runner-distribution bucket.
    - `binaries_syncer.s3.key`: Object key of the runner distribution.
    - `ssm_enabled`: Includes Session Manager permissions in the runner-role contract.
  EOT

  type = object({
    cloudwatch_agent = optional(object({
      enabled = optional(bool, true)
    }), {})
    binaries_syncer = optional(object({
      enabled = optional(bool, true)
      s3 = optional(object({
        arn = string
        key = string
      }), null)
    }), {})
    ssm_enabled = optional(bool, false)
  })

  validation {
    condition     = !var.config.binaries_syncer.enabled || var.config.binaries_syncer.s3 != null
    error_message = "config.binaries_syncer.s3 must be set when config.binaries_syncer.enabled is true."
  }
}

variable "ssm" {
  description = <<-EOT
    Parameter Store configuration used by the EC2 runner-role policies.

    - `paths.root`: Root path for this runner stack.
    - `paths.tokens`: Path segment containing registration tokens and just-in-time configuration.
    - `paths.config`: Path segment containing persistent runner configuration.
  EOT

  type = object({
    paths = object({
      root   = string
      tokens = string
      config = string
    })
  })
}
