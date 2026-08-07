variable "lambda" {
  description = <<-EOF
    Configuration for the lambda function.

    - `aws_partition`: Partition for the base arn if not 'aws'
    - `architecture`: AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86_64' functions.
    - `environment_variables`: Additional environment variables for the Lambda function.
    - `handler`: The entrypoint for the lambda.
    - `principals`: Add extra principals to the role created for execution of the lambda, e.g. for local testing.
    - `principals[*].type`: IAM principal type, such as `Service` or `AWS`.
    - `principals[*].identifiers`: IAM principal identifiers for the selected principal type.
    - `lambda_tags`: Tags added specifically to the Lambda function. These override `tags` values with the same key.
    - `log_group_tags`: Tags added specifically to the Lambda log group. These override `tags` values with the same key.
    - `log_level`: Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'.
    - `logging_kms_key_id`: Specifies the kms key id to encrypt the logs with
    - `logging_retention_in_days`: Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653.
    - `log_class`: The log class of the CloudWatch log group. Valid values are `STANDARD` or `INFREQUENT_ACCESS`.
    - `memory_size`: Memory size limit in MB of the lambda.
    - `reserved_concurrent_executions`: Reserved concurrency for the lambda. Use -1 for no reservation.
    - `metrics_namespace`: Namespace for the metrics emitted by the lambda.
    - `name`: The name of the lambda function.
    - `prefix`: The prefix used for naming resources.
    - `role_path`: The path that will be added to the role, if not set the environment name will be used.
    - `role_permissions_boundary`: Permissions boundary that will be added to the created role for the lambda.
    - `runtime`: AWS Lambda runtime.
    - `s3_bucket`: S3 bucket containing the Lambda deployment package. This is an alternative to `zip`.
    - `s3_key`: Object key of the Lambda deployment package. Required when `s3_bucket` is set.
    - `s3_object_version`: Optional version of the Lambda deployment-package object.
    - `security_group_ids`: List of security group IDs associated with the Lambda function.
    - `subnet_ids`: Subnets used for the Lambda VPC configuration.
    - `tags`: Base tags added to the Lambda function, log group, and execution role. `lambda_tags` and `log_group_tags` override matching keys for their respective resources.
    - `timeout`: Time out of the lambda in seconds.
    - `tracing_config`: Configuration for lambda tracing.
    - `tracing_config.mode`: AWS X-Ray tracing mode. A null value disables tracing.
    - `tracing_config.capture_http_requests`: Whether Powertools tracing captures outgoing HTTP requests.
    - `tracing_config.capture_error`: Whether Powertools tracing captures errors as tracing metadata.
    - `zip`: File location of the lambda zip file.
  EOF
  type = object({
    aws_partition                  = optional(string, "aws")
    architecture                   = optional(string, "arm64")
    environment_variables          = optional(map(string), {})
    handler                        = string
    lambda_tags                    = optional(map(string), {})
    log_group_tags                 = optional(map(string), {})
    log_level                      = optional(string, "info")
    log_class                      = optional(string, "STANDARD")
    logging_kms_key_id             = optional(string, null)
    logging_retention_in_days      = optional(number, 180)
    memory_size                    = optional(number, 256)
    reserved_concurrent_executions = optional(number, null)
    metrics_namespace              = optional(string, "GitHub Runners")
    name                           = string
    prefix                         = optional(string, null)
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
    tags                      = optional(map(string), {})
    timeout                   = optional(number, 60)
    tracing_config = optional(object({
      mode                  = optional(string, null)
      capture_http_requests = optional(bool, false)
      capture_error         = optional(bool, false)
    }), {})
    zip = optional(string, null)
  })

  validation {
    condition     = var.lambda.zip != null || (var.lambda.s3_bucket != null && var.lambda.s3_key != null)
    error_message = "Either lambda.zip or both lambda.s3_bucket and lambda.s3_key must be provided."
  }
  validation {
    condition     = var.lambda.architecture == "arm64" || var.lambda.architecture == "x86_64"
    error_message = "lambda.architecture must be arm64 or x86_64."
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
    ], var.lambda.log_level)
    error_message = "lambda.log_level must be one of silly, trace, debug, info, warn, error, or fatal."

  }
  validation {
    condition     = length(var.lambda.name) + length(var.lambda.prefix) <= 63
    error_message = "The length of `name` + `prefix` must be less than or equal to 63."
  }
}
