<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 5.0 |
| <a name="requirement_null"></a> [null](#requirement\_null) | ~> 3.2 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 5.0 |
| <a name="provider_null"></a> [null](#provider\_null) | ~> 3.2 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_cloudwatch_event_archive.main](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_archive) | resource |
| [aws_cloudwatch_event_bus.main](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_bus) | resource |
| [aws_cloudwatch_event_rule.workflow_job](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_target.dispatcher](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) | resource |
| [aws_cloudwatch_log_group.dispatcher](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_group.webhook](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_iam_role.dispatcher_lambda](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.webhook_lambda](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.dispatcher_kms](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.dispatcher_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.dispatcher_sqs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.dispatcher_ssm](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.dispatcher_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.webhook_eventbridge](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.webhook_kms](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.webhook_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.webhook_ssm](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.dispatcher_vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.webhook_vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_lambda_function.dispatcher](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_function.webhook](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_permission.allow_cloudwatch_to_call_lambda](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_lambda_permission.webhook](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [null_resource.github_app_parameters](https://registry.terraform.io/providers/hashicorp/null/latest/docs/resources/resource) | resource |
| [aws_iam_policy_document.lambda_assume_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.lambda_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_config"></a> [config](#input\_config) | Configuration object for all variables. | <pre>object({<br/>    prefix = string<br/>    archive = optional(object({<br/>      enable         = optional(bool, true)<br/>      retention_days = optional(number, 7)<br/>    }), {})<br/>    tags = optional(map(string), {})<br/><br/>    lambda_subnet_ids         = optional(list(string), [])<br/>    lambda_security_group_ids = optional(list(string), [])<br/>    sqs_job_queues_arns       = list(string)<br/>    lambda_zip                = optional(string, null)<br/>    lambda_memory_size        = optional(number, 256)<br/>    lambda_timeout            = optional(number, 10)<br/>    role_permissions_boundary = optional(string, null)<br/>    role_path                 = optional(string, null)<br/>    logging_retention_in_days = optional(number, 180)<br/>    logging_kms_key_id        = optional(string, null)<br/>    lambda_s3_bucket          = optional(string, null)<br/>    lambda_s3_key             = optional(string, null)<br/>    lambda_s3_object_version  = optional(string, null)<br/>    lambda_apigateway_access_log_settings = optional(object({<br/>      destination_arn = string<br/>      format          = string<br/>    }), null)<br/>    repository_white_list = optional(list(string), [])<br/>    kms_key_arn           = optional(string, null)<br/>    log_level             = optional(string, "info")<br/>    lambda_runtime        = optional(string, "nodejs22.x")<br/>    aws_partition         = optional(string, "aws")<br/>    lambda_architecture   = optional(string, "arm64")<br/>    github_app_parameters = object({<br/>      webhook_secret = map(string)<br/>    })<br/>    tracing_config = optional(object({<br/>      mode                  = optional(string, null)<br/>      capture_http_requests = optional(bool, false)<br/>      capture_error         = optional(bool, false)<br/>    }), {})<br/>    lambda_tags       = optional(map(string), {})<br/>    api_gw_source_arn = string<br/>    ssm_parameter_runner_matcher_config = object({<br/>      name    = string<br/>      arn     = string<br/>      version = string<br/>    })<br/>    accept_events = optional(list(string), null)<br/>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_dispatcher"></a> [dispatcher](#output\_dispatcher) | n/a |
| <a name="output_eventbridge"></a> [eventbridge](#output\_eventbridge) | n/a |
| <a name="output_webhook"></a> [webhook](#output\_webhook) | n/a |
<!-- END_TF_DOCS -->