# Module - Warm pool stop events

> This module is treated as internal module, breaking changes will not trigger a major release bump.

Marks primed warm pool instances available as soon as they stop themselves. One EventBridge rule per deployment sends EC2 stop events to an SQS queue, and a consumer Lambda from the runner control-plane archive reads them in batches. For each batch it describes the instances by ID once, keeps the warm pool instances whose `ghr:environment` has an index table, and marks those that stopped themselves `WARM` while their index item is still `PRIMING`. The scheduled pool run remains the fallback for any event that is missed.

The root module and the multi-runner module create this module once when any runner configuration has `warm_pool` enabled.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.5.6 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.21 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.21 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_consumer"></a> [consumer](#module\_consumer) | ../lambda | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_cloudwatch_event_rule.instance_stopped](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_target.stop_events](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) | resource |
| [aws_iam_role_policy.consumer](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_lambda_event_source_mapping.stop_events](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping) | resource |
| [aws_sqs_queue.stop_events](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue_policy.stop_events](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue_policy) | resource |
| [aws_iam_policy_document.consumer](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.stop_events_queue](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_config"></a> [config](#input\_config) | Configuration for the warm pool stop-event consumer.<br/><br/>`prefix`: Prefix used for naming resources.<br/>`tags`: Tags applied to created resources.<br/>`index_tables`: Warm pool index table per runner environment (`ghr:environment` tag value), as `{ name, arn }`.<br/>`lambda`: Settings for the consumer Lambda, passed to the shared `lambda` module (`name` and `handler` are set by this module).<br/>`lambda.zip`: Local path to the runner control-plane archive; defaults to the packaged `runners.zip` when neither `zip` nor `s3_key` is set.<br/>`batching_window_in_seconds`: Maximum time the consumer waits to fill a batch. | <pre>object({<br/>    prefix = string<br/>    tags   = optional(map(string), {})<br/>    index_tables = map(object({<br/>      name = string<br/>      arn  = string<br/>    }))<br/>    lambda = object({<br/>      aws_partition             = optional(string, "aws")<br/>      architecture              = optional(string, "arm64")<br/>      lambda_tags               = optional(map(string), {})<br/>      log_level                 = optional(string, "info")<br/>      log_class                 = optional(string, "STANDARD")<br/>      logging_kms_key_id        = optional(string, null)<br/>      logging_retention_in_days = optional(number, 180)<br/>      memory_size               = optional(number, 256)<br/>      principals = optional(list(object({<br/>        type        = string<br/>        identifiers = list(string)<br/>      })), [])<br/>      role_path                 = optional(string, null)<br/>      role_permissions_boundary = optional(string, null)<br/>      runtime                   = optional(string, "nodejs24.x")<br/>      s3_bucket                 = optional(string, null)<br/>      s3_key                    = optional(string, null)<br/>      s3_object_version         = optional(string, null)<br/>      security_group_ids        = optional(list(string), [])<br/>      subnet_ids                = optional(list(string), [])<br/>      timeout                   = optional(number, 30)<br/>      tracing_config = optional(object({<br/>        mode                  = optional(string, null)<br/>        capture_http_requests = optional(bool, false)<br/>        capture_error         = optional(bool, false)<br/>      }), {})<br/>      zip = optional(string, null)<br/>    })<br/>    batching_window_in_seconds = optional(number, 5)<br/>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_event_source_mapping"></a> [event\_source\_mapping](#output\_event\_source\_mapping) | n/a |
| <a name="output_lambda"></a> [lambda](#output\_lambda) | n/a |
| <a name="output_queue"></a> [queue](#output\_queue) | n/a |
| <a name="output_rule"></a> [rule](#output\_rule) | n/a |
<!-- END_TF_DOCS -->
