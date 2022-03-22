# Module - Runner binaries syncer

This module creates a lambda that will sync GitHub action binary to a S3 bucket, the lambda will be triggered via a CloudWatch event. The distribution is cached to avoid the latency of downloading the distribution during the setup. After deployment the lambda will be triggered via an S3 object created at deployment time.

## Usages

Usage examples are available in the root module. By default the root module will assume local zip files containing the lambda distribution are available. See the [download lambda module](../download-lambda/README.md) for more information.

## Lambda Function

The Lambda function is written in [TypeScript](https://www.typescriptlang.org/) and requires Node 12.x and yarn. Sources are located in [./lambdas/runners-binaries-syncer].

### Install

```bash
cd lambdas/runners
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
| [aws_cloudwatch_event_rule.syncer](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_target.syncer](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) | resource |
| [aws_cloudwatch_log_group.syncer](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_iam_role.syncer_lambda](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.lambda_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.syncer](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_lambda_function.syncer](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_permission.on_deploy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_lambda_permission.syncer](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_s3_bucket.action_dist](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket_notification.on_deploy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_notification) | resource |
| [aws_s3_bucket_object.trigger](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_object) | resource |
| [aws_s3_bucket_public_access_block.action_dist](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_public_access_block) | resource |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_iam_policy_document.lambda_assume_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region. | `string` | n/a | yes |
| <a name="input_distribution_bucket_name"></a> [distribution\_bucket\_name](#input\_distribution\_bucket\_name) | Bucket for storing the action runner distribution. | `string` | n/a | yes |
| <a name="input_environment"></a> [environment](#input\_environment) | A name that identifies the environment, used as prefix and for tagging. | `string` | n/a | yes |
| <a name="input_lambda_principals"></a> [lambda\_principals](#input\_lambda\_principals) | (Optional) add extra principals to the role created for execution of the lambda, e.g. for local testing. | <pre>list(object({<br>    type        = string<br>    identifiers = list(string)<br>  }))</pre> | `[]` | no |
| <a name="input_lambda_s3_bucket"></a> [lambda\_s3\_bucket](#input\_lambda\_s3\_bucket) | S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly. | `any` | `null` | no |
| <a name="input_lambda_schedule_expression"></a> [lambda\_schedule\_expression](#input\_lambda\_schedule\_expression) | Scheduler expression for action runner binary syncer. | `string` | `"cron(27 * * * ? *)"` | no |
| <a name="input_lambda_security_group_ids"></a> [lambda\_security\_group\_ids](#input\_lambda\_security\_group\_ids) | List of security group IDs associated with the Lambda function. | `list(string)` | `[]` | no |
| <a name="input_lambda_subnet_ids"></a> [lambda\_subnet\_ids](#input\_lambda\_subnet\_ids) | List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`. | `list(string)` | `[]` | no |
| <a name="input_lambda_timeout"></a> [lambda\_timeout](#input\_lambda\_timeout) | Time out of the lambda in seconds. | `number` | `300` | no |
| <a name="input_lambda_zip"></a> [lambda\_zip](#input\_lambda\_zip) | File location of the lambda zip file. | `string` | `null` | no |
| <a name="input_log_level"></a> [log\_level](#input\_log\_level) | Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'. | `string` | `"info"` | no |
| <a name="input_log_type"></a> [log\_type](#input\_log\_type) | Logging format for lambda logging. Valid values are 'json', 'pretty', 'hidden'. | `string` | `"pretty"` | no |
| <a name="input_logging_kms_key_id"></a> [logging\_kms\_key\_id](#input\_logging\_kms\_key\_id) | Specifies the kms key id to encrypt the logs with | `string` | `null` | no |
| <a name="input_logging_retention_in_days"></a> [logging\_retention\_in\_days](#input\_logging\_retention\_in\_days) | Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653. | `number` | `7` | no |
| <a name="input_role_path"></a> [role\_path](#input\_role\_path) | The path that will be added to the role, if not set the environment name will be used. | `string` | `null` | no |
| <a name="input_role_permissions_boundary"></a> [role\_permissions\_boundary](#input\_role\_permissions\_boundary) | Permissions boundary that will be added to the created role for the lambda. | `string` | `null` | no |
| <a name="input_runner_allow_prerelease_binaries"></a> [runner\_allow\_prerelease\_binaries](#input\_runner\_allow\_prerelease\_binaries) | Allow the runners to update to prerelease binaries. | `bool` | `false` | no |
| <a name="input_runner_architecture"></a> [runner\_architecture](#input\_runner\_architecture) | The platform architecture of the runner instance\_type. | `string` | `"x64"` | no |
| <a name="input_runner_os"></a> [runner\_os](#input\_runner\_os) | The EC2 Operating System type to use for action runner instances (linux,windows). | `string` | `"linux"` | no |
| <a name="input_server_side_encryption_configuration"></a> [server\_side\_encryption\_configuration](#input\_server\_side\_encryption\_configuration) | Map containing server-side encryption configuration. | `any` | `{}` | no |
| <a name="input_syncer_lambda_s3_key"></a> [syncer\_lambda\_s3\_key](#input\_syncer\_lambda\_s3\_key) | S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas. | `any` | `null` | no |
| <a name="input_syncer_lambda_s3_object_version"></a> [syncer\_lambda\_s3\_object\_version](#input\_syncer\_lambda\_s3\_object\_version) | S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket. | `any` | `null` | no |
| <a name="input_tags"></a> [tags](#input\_tags) | Map of tags that will be added to created resources. By default resources will be tagged with name and environment. | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_bucket"></a> [bucket](#output\_bucket) | n/a |
| <a name="output_lambda"></a> [lambda](#output\_lambda) | n/a |
| <a name="output_lambda_role"></a> [lambda\_role](#output\_lambda\_role) | n/a |
| <a name="output_runner_distribution_object_key"></a> [runner\_distribution\_object\_key](#output\_runner\_distribution\_object\_key) | n/a |
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
