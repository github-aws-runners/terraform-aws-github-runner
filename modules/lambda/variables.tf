variable "lambda" {
  description = <<-EOF
    Configuration for the lambda function.

    `aws_partition`: Partition for the base arn if not 'aws'
    `architecture`: AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86_64' functions.
    `environment_variables`: Environment variables for the lambda.
    `handler`: The entrypoint for the lambda.
    `principals`: Add extra principals to the role created for execution of the lambda, e.g. for local testing.
    `lambda_tags`: Map of tags that will be added to created resources. By default resources will be tagged with name and environment.
    `log_level`: Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'.
    `logging_kms_key_id`: Specifies the kms key id to encrypt the logs with
    `logging_retention_in_days`: Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653.
    `memory_size`: Memory size linit in MB of the lambda.
    `metrics_namespace`: Namespace for the metrics emitted by the lambda.
    `name`: The name of the lambda function.
    `prefix`: The prefix used for naming resources.
    `role_path`: The path that will be added to the role, if not set the environment name will be used.
    `role_permissions_boundary`: Permissions boundary that will be added to the created role for the lambda.
    `runtime`: AWS Lambda runtime.
    `s3_bucket`: S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly.
    `s3_key`: S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas.
    `s3_object_version`: S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket.
    `security_group_ids`: List of security group IDs associated with the Lambda function.
    `subnet_ids`: List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`.
    `tags`: Map of tags that will be added to created resources. By default resources will be tagged with name and environment.
    `timeout`: Time out of the lambda in seconds.
    `tracing_config`: Configuration for lambda tracing.
    `zip`: File location of the lambda zip file.
  EOF
  type = object({
    aws_partition             = optional(string, "aws")
    architecture              = optional(string, "arm64")
    environment_variables     = optional(map(string), {})
    handler                   = string
    lambda_tags               = optional(map(string), {})
    log_level                 = optional(string, "info")
    logging_kms_key_id        = optional(string, null)
    logging_retention_in_days = optional(number, 180)
    memory_size               = optional(number, 256)
    metrics_namespace         = optional(string, "GitHub Runners")
    name                      = string
    prefix                    = optional(string, null)
    principals = optional(list(object({
      type        = string
      identifiers = list(string)
    })), [])
    role_path                 = optional(string, null)
    role_permissions_boundary = optional(string, null)
    runtime                   = optional(string, "nodejs20.x")
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
    error_message = "Either `lambda_zip` or `lambda_s3_bucket` and `lambda_s3_key` must be provided."
  }
  validation {
    condition     = var.lambda.architecture == "arm64" || var.lambda.architecture == "x86_64"
    error_message = "`lambda_architecture` value is not valid, valid values are: `arm64` and `x86_64`."
  }
  validation {
    condition = anytrue([
      var.lambda.log_level == "debug",
      var.lambda.log_level == "info",
      var.lambda.log_level == "warn",
      var.lambda.log_level == "error",
    ])
    error_message = "`log_level` value not valid. Valid values are 'debug', 'info', 'warn', 'error'."

  }
  validation {
    condition     = length(var.lambda.name) + length(var.lambda.prefix) <= 63
    error_message = "The length of `name` + `prefix` must be less than or equal to 63."
  }
}
