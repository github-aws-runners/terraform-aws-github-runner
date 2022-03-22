# Module - GitHub App web hook

This module creates an API gateway endpoint and lambda function to handle GitHub App webhook events.

## Usages

Usage examples are available in the root module. By default the root module will assume local zip files containing the lambda distribution are available. See the [download lambda module](../download-lambda/README.md) for more information.

## Lambda Function

The Lambda function is written in [TypeScript](https://www.typescriptlang.org/) and requires Node 12.x and yarn. Sources are located in [./lambdas/webhook].

### Install

```bash
cd lambdas/webhook
yarn install
```

### Test

Test are implemented with [Jest](https://jestjs.io/), calls to AWS and GitHub are mocked.

```bash
yarn run test
```

### Package

To compile all TypeScript/JavaScript sources in a single file [ncc](https://github.com/zeit/ncc) is used.

```bash
yarn run dist
```

<!-- BEGINNING OF PRE-COMMIT-TERRAFORM DOCS HOOK -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 0.14.1 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 3.38 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | ~> 3.38 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_apigatewayv2_api.webhook](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_api) | resource |
| [aws_apigatewayv2_integration.webhook](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_integration) | resource |
| [aws_apigatewayv2_route.webhook](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_route) | resource |
| [aws_apigatewayv2_stage.webhook](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_stage) | resource |
| [aws_cloudwatch_log_group.webhook](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_iam_role.webhook_lambda](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.webhook_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.webhook_sqs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.webhook_ssm](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_lambda_function.webhook](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_permission.webhook](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_iam_policy_document.lambda_assume_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region. | `string` | n/a | yes |
| <a name="input_disable_check_wokflow_job_labels"></a> [disable\_check\_wokflow\_job\_labels](#input\_disable\_check\_wokflow\_job\_labels) | Disable the the check of workflow labels. | `bool` | `false` | no |
| <a name="input_enable_workflow_job_labels_check"></a> [enable\_workflow\_job\_labels\_check](#input\_enable\_workflow\_job\_labels\_check) | If set to true all labels in the workflow job even are matched agaist the custom labels and GitHub labels (os, architecture and `self-hosted`). When the labels are not matching the event is dropped at the webhook. | `bool` | `false` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | A name that identifies the environment, used as prefix and for tagging. | `string` | n/a | yes |
| <a name="input_github_app_webhook_secret_arn"></a> [github\_app\_webhook\_secret\_arn](#input\_github\_app\_webhook\_secret\_arn) | n/a | `string` | n/a | yes |
| <a name="input_kms_key_arn"></a> [kms\_key\_arn](#input\_kms\_key\_arn) | Optional CMK Key ARN to be used for Parameter Store. | `string` | `null` | no |
| <a name="input_lambda_s3_bucket"></a> [lambda\_s3\_bucket](#input\_lambda\_s3\_bucket) | S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly. | `any` | `null` | no |
| <a name="input_lambda_timeout"></a> [lambda\_timeout](#input\_lambda\_timeout) | Time out of the lambda in seconds. | `number` | `10` | no |
| <a name="input_lambda_zip"></a> [lambda\_zip](#input\_lambda\_zip) | File location of the lambda zip file. | `string` | `null` | no |
| <a name="input_log_level"></a> [log\_level](#input\_log\_level) | Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'. | `string` | `"info"` | no |
| <a name="input_log_type"></a> [log\_type](#input\_log\_type) | Logging format for lambda logging. Valid values are 'json', 'pretty', 'hidden'. | `string` | `"pretty"` | no |
| <a name="input_logging_kms_key_id"></a> [logging\_kms\_key\_id](#input\_logging\_kms\_key\_id) | Specifies the kms key id to encrypt the logs with | `string` | `null` | no |
| <a name="input_logging_retention_in_days"></a> [logging\_retention\_in\_days](#input\_logging\_retention\_in\_days) | Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653. | `number` | `7` | no |
| <a name="input_repository_white_list"></a> [repository\_white\_list](#input\_repository\_white\_list) | List of repositories allowed to use the github app | `list(string)` | `[]` | no |
| <a name="input_role_path"></a> [role\_path](#input\_role\_path) | The path that will be added to the role; if not set, the environment name will be used. | `string` | `null` | no |
| <a name="input_role_permissions_boundary"></a> [role\_permissions\_boundary](#input\_role\_permissions\_boundary) | Permissions boundary that will be added to the created role for the lambda. | `string` | `null` | no |
| <a name="input_runner_labels"></a> [runner\_labels](#input\_runner\_labels) | Extra (custom) labels for the runners (GitHub). Separate each label by a comma. Labels checks on the webhook can be enforced by setting `enable_workflow_job_labels_check`. GitHub read-only labels should not be provided. | `string` | `""` | no |
| <a name="input_sqs_build_queue"></a> [sqs\_build\_queue](#input\_sqs\_build\_queue) | SQS queue to publish accepted build events. | <pre>object({<br>    id  = string<br>    arn = string<br>  })</pre> | n/a | yes |
| <a name="input_sqs_build_queue_fifo"></a> [sqs\_build\_queue\_fifo](#input\_sqs\_build\_queue\_fifo) | Enable a FIFO queue to remain the order of events received by the webhook. Suggest to set to true for repo level runners. | `bool` | `false` | no |
| <a name="input_tags"></a> [tags](#input\_tags) | Map of tags that will be added to created resources. By default resources will be tagged with name and environment. | `map(string)` | `{}` | no |
| <a name="input_webhook_lambda_s3_key"></a> [webhook\_lambda\_s3\_key](#input\_webhook\_lambda\_s3\_key) | S3 key for webhook lambda function. Required if using S3 bucket to specify lambdas. | `any` | `null` | no |
| <a name="input_webhook_lambda_s3_object_version"></a> [webhook\_lambda\_s3\_object\_version](#input\_webhook\_lambda\_s3\_object\_version) | S3 object version for webhook lambda function. Useful if S3 versioning is enabled on source bucket. | `any` | `null` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_endpoint_relative_path"></a> [endpoint\_relative\_path](#output\_endpoint\_relative\_path) | n/a |
| <a name="output_gateway"></a> [gateway](#output\_gateway) | n/a |
| <a name="output_lambda"></a> [lambda](#output\_lambda) | n/a |
| <a name="output_role"></a> [role](#output\_role) | n/a |
<!-- END OF PRE-COMMIT-TERRAFORM DOCS HOOK -->

## Philips Forest

This module is part of the Philips Forest.

```

                                                     ___                   _
                                                    / __\__  _ __ ___  ___| |_
                                                   / _\/ _ \| '__/ _ \/ __| __|
                                                  / / | (_) | | |  __/\__ \ |_
                                                  \/   \___/|_|  \___||___/\__|

                                                                 Infrastructure

```

Talk to the forestkeepers in the `forest`-channel on Slack.

[![Slack](https://philips-software-slackin.now.sh/badge.svg)](https://philips-software-slackin.now.sh)
