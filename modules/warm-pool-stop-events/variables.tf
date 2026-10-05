variable "config" {
  description = <<-EOF
    Configuration for the warm pool stop-event consumer.

    `prefix`: Prefix used for naming resources.
    `tags`: Tags applied to created resources.
    `index_tables`: Warm pool index table per runner environment (`ghr:environment` tag value), as `{ name, arn }`.
    `lambda`: Settings for the consumer Lambda, passed to the shared `lambda` module (`name` and `handler` are set by this module).
    `lambda.zip`: Local path to the runner control-plane archive; defaults to the packaged `runners.zip` when neither `zip` nor `s3_key` is set.
    `batching_window_in_seconds`: Maximum time the consumer waits to fill a batch.
  EOF
  type = object({
    prefix = string
    tags   = optional(map(string), {})
    index_tables = map(object({
      name = string
      arn  = string
    }))
    lambda = object({
      aws_partition             = optional(string, "aws")
      architecture              = optional(string, "arm64")
      lambda_tags               = optional(map(string), {})
      log_level                 = optional(string, "info")
      log_class                 = optional(string, "STANDARD")
      logging_kms_key_id        = optional(string, null)
      logging_retention_in_days = optional(number, 180)
      memory_size               = optional(number, 256)
      principals = optional(list(object({
        type        = string
        identifiers = list(string)
      })), [])
      role_path                 = optional(string, null)
      role_permissions_boundary = optional(string, null)
      runtime                   = optional(string, "nodejs24.x")
      s3_bucket                 = optional(string, null)
      s3_key                    = optional(string, null)
      s3_object_version         = optional(string, null)
      security_group_ids        = optional(list(string), [])
      subnet_ids                = optional(list(string), [])
      timeout                   = optional(number, 30)
      tracing_config = optional(object({
        mode                  = optional(string, null)
        capture_http_requests = optional(bool, false)
        capture_error         = optional(bool, false)
      }), {})
      zip = optional(string, null)
    })
    batching_window_in_seconds = optional(number, 5)
  })

  validation {
    condition     = length(var.config.index_tables) > 0
    error_message = "At least one warm pool index table is required."
  }
}
