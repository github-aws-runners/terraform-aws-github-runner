# Module - Job Retry

This module is listening to a SQS queue where the scale-up lambda publishes messages for jobs that needs to trigger a retry if still queued. The job retry module lambda function is handling the messages, checking if the job is queued. Next for queued jobs a message is published to the build queue for the scale-up lambda. The scale-up lambda will handle the message as any other workflow job event.

## Usages

The module is an inner module used by the webhook orchestration provider when the opt-in feature for job retry is enabled. The module is not intended to be used standalone.


<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.4.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.21 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.21 |
| <a name="provider_terraform"></a> [terraform](#provider\_terraform) | n/a |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_cloudwatch_log_group.job_retry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_iam_role.job_retry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.job_retry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.job_retry_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.job_retry_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.job_retry_vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_lambda_event_source_mapping.job_retry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping) | resource |
| [aws_lambda_function.job_retry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_permission.job_retry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_sqs_queue.job_retry_check_queue](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue_policy.job_retry_check_queue_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue_policy) | resource |
| [terraform_data.validate_config](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/resources/data) | resource |
| [aws_iam_policy_document.deny_insecure_transport](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.job_retry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.job_retry_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.lambda_assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.lambda_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_config"></a> [config](#input\_config) | Provider-neutral job-retry configuration assembled by runner-config.<br/><br/>- `prefix`: Prefix used to name job-retry resources.<br/>- `aws_partition`: AWS partition used to construct the Lambda VPC managed-policy ARN.<br/>- `lambda.artifact.zip`: Resolved local control-plane archive.<br/>- `lambda.artifact.s3.bucket`: Optional S3 bucket containing the Lambda archive.<br/>- `lambda.artifact.s3.key`: Object key of the Lambda archive.<br/>- `lambda.artifact.s3.object_version`: Optional object version of the Lambda archive.<br/>- `lambda.runtime`: Runtime used by the job-retry Lambda.<br/>- `lambda.architecture`: Instruction-set architecture used by the job-retry Lambda.<br/>- `lambda.memory_size`: Memory allocated to the job-retry Lambda.<br/>- `lambda.timeout`: Lambda timeout and retry-queue visibility timeout in seconds.<br/>- `lambda.reserved_concurrent_executions`: Reserved concurrency for the Lambda. Use `-1` for unreserved concurrency.<br/>- `lambda.environment_variables`: Additional Lambda environment variables. Required job-retry variables override matching keys.<br/>- `lambda.vpc.subnet_ids`: Subnets used for Lambda VPC configuration.<br/>- `lambda.vpc.security_group_ids`: Security groups used for Lambda VPC configuration.<br/>- `lambda.role.path`: IAM path used for the job-retry Lambda role.<br/>- `lambda.role.permissions_boundary`: Optional permissions boundary for the Lambda role.<br/>- `lambda.role.principals`: Extra principals allowed to assume the Lambda role, for example during local testing.<br/>- `runner.name_prefix`: Prefix used to identify runners belonging to this runner configuration.<br/>- `github.organization_runners`: Enables organization runners.<br/>- `github.enterprise_server.url`: Optional GitHub Enterprise Server URL.<br/>- `github.enterprise_server.ssl_verify`: Enables TLS certificate verification for GitHub Enterprise Server requests.<br/>- `github.user_agent`: Optional User-Agent sent to GitHub.<br/>- `github.app_parameters.key_base64`: Ordered Parameter Store references for GitHub App private keys.<br/>- `github.app_parameters.id`: Ordered Parameter Store references for GitHub App IDs.<br/>- `github.app_parameters.installation_id`: Ordered optional Parameter Store references for GitHub App installation IDs.<br/>- `queue.build`: URL and ARN of the build queue to which retry messages are published.<br/>- `queue.kms_key_id`: Optional KMS key ARN used to encrypt the build queue. This is distinct from the Parameter Store key.<br/>- `queue.event_source_mapping.batch_size`: Maximum records delivered per job-retry invocation.<br/>- `queue.event_source_mapping.maximum_batching_window_in_seconds`: Maximum event batching window.<br/>- `queue.encryption`: Server-side encryption configuration for the retry queue.<br/>- `ssm.kms_key_id`: Optional KMS key ARN used by the job-retry IAM policy. Its value may be unknown until apply.<br/>- `observability.logs`: Logging level, retention, encryption, and log-class configuration.<br/>- `observability.tracing`: Lambda X-Ray and tracing-helper configuration.<br/>- `observability.metrics`: Metrics enablement, namespace, and job-retry metric configuration.<br/>- `tags.resources`: Tags for the job-retry Lambda role and component resources.<br/>- `tags.lambda`: Tags for the job-retry Lambda function.<br/>- `tags.log_group`: Tags for the job-retry log group.<br/>- `tags.queue`: Tags for the retry queue.<br/>- `tags.event_source_mapping`: Tags for the retry-queue event-source mapping. | <pre>object({<br/>    prefix        = string<br/>    aws_partition = string<br/>    lambda = object({<br/>      artifact = object({<br/>        zip = string<br/>        s3 = object({<br/>          bucket         = optional(string, null)<br/>          key            = optional(string, null)<br/>          object_version = optional(string, null)<br/>        })<br/>      })<br/>      runtime                        = string<br/>      architecture                   = string<br/>      memory_size                    = number<br/>      timeout                        = number<br/>      reserved_concurrent_executions = number<br/>      environment_variables          = map(string)<br/>      vpc = object({<br/>        subnet_ids         = list(string)<br/>        security_group_ids = list(string)<br/>      })<br/>      role = object({<br/>        path                 = string<br/>        permissions_boundary = optional(string, null)<br/>        principals = list(object({<br/>          type        = string<br/>          identifiers = list(string)<br/>        }))<br/>      })<br/>    })<br/>    runner = object({<br/>      name_prefix = string<br/>    })<br/>    github = object({<br/>      organization_runners = bool<br/>      enterprise_server = object({<br/>        url        = optional(string, null)<br/>        ssl_verify = optional(bool, true)<br/>      })<br/>      user_agent = optional(string, null)<br/>      app_parameters = object({<br/>        key_base64      = list(map(string))<br/>        id              = list(map(string))<br/>        installation_id = list(object({ name = string, arn = string }))<br/>      })<br/>    })<br/>    queue = object({<br/>      build = object({<br/>        url = string<br/>        arn = string<br/>      })<br/>      kms_key_id = optional(string, null)<br/>      event_source_mapping = object({<br/>        batch_size                         = number<br/>        maximum_batching_window_in_seconds = number<br/>      })<br/>      encryption = object({<br/>        sqs_managed_sse_enabled           = bool<br/>        kms_master_key_id                 = optional(string, null)<br/>        kms_data_key_reuse_period_seconds = optional(number, null)<br/>      })<br/>    })<br/>    ssm = object({<br/>      kms_key_id = optional(string, null)<br/>    })<br/>    observability = object({<br/>      logs = object({<br/>        level             = string<br/>        retention_in_days = number<br/>        kms_key_id        = optional(string, null)<br/>        class             = string<br/>      })<br/>      tracing = object({<br/>        mode                  = optional(string, null)<br/>        capture_http_requests = bool<br/>        capture_error         = bool<br/>      })<br/>      metrics = object({<br/>        enabled   = bool<br/>        namespace = string<br/>        metric = object({<br/>          github_app_rate_limit = object({<br/>            enabled = bool<br/>          })<br/>          job_retry = object({<br/>            enabled = bool<br/>          })<br/>        })<br/>      })<br/>    })<br/>    tags = object({<br/>      resources            = map(string)<br/>      lambda               = map(string)<br/>      log_group            = map(string)<br/>      queue                = map(string)<br/>      event_source_mapping = map(string)<br/>    })<br/>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_job_retry_check_queue"></a> [job\_retry\_check\_queue](#output\_job\_retry\_check\_queue) | Queue consumed by the job-retry Lambda. |
| <a name="output_lambda"></a> [lambda](#output\_lambda) | Job-retry Lambda resources. |
<!-- END_TF_DOCS -->
