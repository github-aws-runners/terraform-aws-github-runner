# Global Lambda configuration.
variable "global_config_lambda" {
  description = <<-EOT
    Global Lambda configuration shared by all runner lanes.

    global_config_lambda = {
      artifact.s3.bucket: "S3 bucket containing Lambda deployment artifacts."
      runtime: "Default Lambda runtime."
      architecture: "Default Lambda instruction-set architecture."
      principals: "Additional AWS principals allowed to invoke the Lambda functions."
      principals.type: "Principal type, such as AWS account, service, or organization."
      principals.identifiers: "Identifiers allowed for the principal type."
      subnet_ids: "Subnets used by Lambda functions."
      security_group_ids: "Security groups attached to Lambda functions."
      tags: "Tags applied to Lambda functions and related resources."
      role.path: "IAM path used for Lambda execution roles."
      role.permissions_boundary: "Optional IAM permissions boundary ARN for Lambda execution roles."
    }
  EOT
  type = object({
    artifact = optional(object({
      s3 = optional(object({
        bucket = optional(string, null)
      }), {})
    }), {})
    runtime      = optional(string, "nodejs24.x")
    architecture = optional(string, "arm64")
    principals = optional(list(object({
      type        = string
      identifiers = list(string)
    })), [])
    subnet_ids         = optional(list(string), [])
    security_group_ids = optional(list(string), [])
    tags               = optional(map(string), {})
    role = optional(object({
      path                 = optional(string, null)
      permissions_boundary = optional(string, null)
    }), {})
  })
  default = {}
}
