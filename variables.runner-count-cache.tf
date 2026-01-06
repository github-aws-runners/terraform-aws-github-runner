variable "runner_count_cache" {
  description = <<-EOF
    Configuration for the runner count cache feature. This feature reduces EC2 DescribeInstances API calls
    during scale-up operations by maintaining an event-driven count of active runners in DynamoDB.
    This addresses rate limiting issues in high-volume environments (20K+ runners/day).

    See: https://github.com/github-aws-runners/terraform-aws-github-runner/issues/4710

    `enable`: Enable or disable the runner count cache feature.
    `stale_threshold_ms`: How long (in milliseconds) before a cached count is considered stale and falls back to EC2 API. Default 60000 (1 minute).
    `ttl_seconds`: TTL for DynamoDB items in seconds. Default 86400 (24 hours).
    `lambda_memory_size`: Memory size limit in MB of the counter lambda.
    `lambda_timeout`: Timeout of the counter lambda in seconds.
    `lambda_s3_key`: S3 key for lambda function. Required if using S3 bucket to specify lambdas.
    `lambda_s3_object_version`: S3 object version for lambda function.
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
