variable "runner_count_cache" {
  description = <<-EOF
    Configuration for the runner count cache feature. Reduces the compute provider's runner
    listing calls (e.g. EC2 DescribeInstances) during scale-up by maintaining an event-driven
    count of active runners in DynamoDB, addressing API rate limiting in high-volume
    environments. See https://github.com/github-aws-runners/terraform-aws-github-runner/issues/4710

    `enable`: Enable or disable the runner count cache feature.
    `stale_threshold_ms`: Age (ms) after which a cached count is considered stale and scale-up falls back to the provider. Default 60000.
    `ttl_seconds`: TTL for DynamoDB items in seconds. Default 86400.
    `lambda_memory_size`: Memory (MB) of the counter lambda.
    `lambda_timeout`: Timeout (seconds) of the counter lambda.
    `lambda_s3_key`: S3 key for the lambda artifact. Required if lambdas are sourced from S3.
    `lambda_s3_object_version`: S3 object version for the lambda artifact.
  EOF

  type = object({
    enable                   = optional(bool, false)
    stale_threshold_ms       = optional(number, 60000)
    ttl_seconds              = optional(number, 86400)
    lambda_memory_size       = optional(number, 256)
    lambda_timeout           = optional(number, 30)
    lambda_s3_key            = optional(string, null)
    lambda_s3_object_version = optional(string, null)
  })
  default = {}
}
