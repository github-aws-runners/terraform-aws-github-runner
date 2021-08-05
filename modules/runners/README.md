# Module - Scale runners

This module creates resources required to run the GitHub action runner on AWS EC2 spot instances. The life cycle of the runners on AWS is managed by two lambda functions. One function will handle scaling up, the other scaling down.

## Overview

### Action runners on EC2

The action runners are created via a launch template, on launch template only the subnet needs to be provided. During launch the installation is handled via a user data script. The configuration is fetched from SSM parameter store.

### Lambda scale up

The scale up lambda is triggered by events on a SQS queue. Events on this queued are delayed, which will will give the workflow some time to start running on available runners. For each event the lambda will check the workflow is still queued and no other limits are reached. In that case the lambda will create a new EC2 instance. The lambda only needs to know which launch template to use and which subnets are available. From the available subnets a random one will be chosen. Once the instance is created the event is assumed as handled, and we assume the workflow wil start at some moment once the created instance is ready.

### Lambda scale down

The scale down lambda is triggered via a CloudWatch event. The event is triggered by a cron expression defined in the variable `scale_down_schedule_expression` (https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html). For scaling down GitHub does not provide a good API yet, therefore we run the scaling down based on this event every x minutes. Each time the lambda is triggered it tries to remove all runners older than x minutes (configurable) managed in this deployment. In case the runner can be removed from GitHub, which means it is not executing a workflow, the lambda will terminate the EC2 instance.

## Usages

Usage examples are available in the root module. By default the root module will assume local zip files containing the lambda distribution are available. See the [download lambda module](../download-lambda/README.md) for more information.

## Lambda Function

The Lambda function is written in [TypeScript](https://www.typescriptlang.org/) and requires Node 12.x and yarn. Sources are located in [./lambdas/runners]. Two lambda functions share the same sources, there is one entry point for `scaleDown` and another one for `scaleUp`.

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

No requirements.

## Providers

| Name | Version |
|------|---------|
| aws | n/a |

## Modules

No Modules.

## Resources

| Name |
|------|
| [aws_ami](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ami) |
| [aws_caller_identity](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) |
| [aws_cloudwatch_event_rule](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) |
| [aws_cloudwatch_event_target](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) |
| [aws_cloudwatch_log_group](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) |
| [aws_iam_instance_profile](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_instance_profile) |
| [aws_iam_policy_document](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) |
| [aws_iam_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) |
| [aws_iam_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) |
| [aws_iam_role_policy_attachment](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) |
| [aws_lambda_event_source_mapping](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping) |
| [aws_lambda_function](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) |
| [aws_lambda_permission](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) |
| [aws_launch_template](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/launch_template) |
| [aws_security_group](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group) |
| [aws_ssm_parameter](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| ami\_filter | List of maps used to create the AMI filter for the action runner AMI. | `map(list(string))` | <pre>{<br>  "name": [<br>    "amzn2-ami-hvm-2.*-x86_64-ebs"<br>  ]<br>}</pre> | no |
| ami\_owners | The list of owners used to select the AMI of action runner instances. | `list(string)` | <pre>[<br>  "amazon"<br>]</pre> | no |
| aws\_region | AWS region. | `string` | n/a | yes |
| block\_device\_mappings | The EC2 instance block device configuration. Takes the following keys: `device_name`, `delete_on_termination`, `volume_type`, `volume_size`, `encrypted`, `iops` | `map(string)` | `{}` | no |
| cloudwatch\_config | (optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details. | `string` | `null` | no |
| create\_service\_linked\_role\_spot | (optional) create the serviced linked role for spot instances that is required by the scale-up lambda. | `bool` | `false` | no |
| enable\_cloudwatch\_agent | Enabling the cloudwatch agent on the ec2 runner instances, the runner contains default config. Configuration can be overridden via `cloudwatch_config`. | `bool` | `true` | no |
| enable\_organization\_runners | n/a | `bool` | n/a | yes |
| enable\_ssm\_on\_runners | Enable to allow access the runner instances for debugging purposes via SSM. Note that this adds additional permissions to the runner instances. | `bool` | n/a | yes |
| environment | A name that identifies the environment, used as prefix and for tagging. | `string` | n/a | yes |
| ghes\_url | GitHub Enterprise Server URL. DO NOT SET IF USING PUBLIC GITHUB | `string` | `null` | no |
| github\_app\_parameters | Parameter Store for GitHub App Parameters. | <pre>object({<br>    key_base64    = map(string)<br>    id            = map(string)<br>    client_id     = map(string)<br>    client_secret = map(string)<br>  })</pre> | n/a | yes |
| idle\_config | List of time period that can be defined as cron expression to keep a minimum amount of runners active instead of scaling down to 0. By defining this list you can ensure that in time periods that match the cron expression within 5 seconds a runner is kept idle. | <pre>list(object({<br>    cron      = string<br>    timeZone  = string<br>    idleCount = number<br>  }))</pre> | `[]` | no |
| instance\_profile\_path | The path that will be added to the instance\_profile, if not set the environment name will be used. | `string` | `null` | no |
| instance\_type | [DEPRECATED] See instance\_types. | `string` | `"m5.large"` | no |
| instance\_types | List of instance types for the action runner. | `set(string)` | `null` | no |
| key\_name | Key pair name | `string` | `null` | no |
| kms\_key\_arn | Optional CMK Key ARN to be used for Parameter Store. | `string` | `null` | no |
| lambda\_s3\_bucket | S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly. | `any` | `null` | no |
| lambda\_security\_group\_ids | List of security group IDs associated with the Lambda function. | `list(string)` | `[]` | no |
| lambda\_subnet\_ids | List of subnets in which the lambda will be launched, the subnets needs to be subnets in the `vpc_id`. | `list(string)` | `[]` | no |
| lambda\_timeout\_scale\_down | Time out for the scale down lambda in seconds. | `number` | `60` | no |
| lambda\_timeout\_scale\_up | Time out for the scale up lambda in seconds. | `number` | `60` | no |
| lambda\_zip | File location of the lambda zip file. | `string` | `null` | no |
| logging\_retention\_in\_days | Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653. | `number` | `180` | no |
| market\_options | Market options for the action runner instances. | `string` | `"spot"` | no |
| minimum\_running\_time\_in\_minutes | The time an ec2 action runner should be running at minimum before terminated if non busy. | `number` | `5` | no |
| overrides | This maps provides the possibility to override some defaults. The following attributes are supported: `name_sg` overwrite the `Name` tag for all security groups created by this module. `name_runner_agent_instance` override the `Name` tag for the ec2 instance defined in the auto launch configuration. `name_docker_machine_runners` override the `Name` tag spot instances created by the runner agent. | `map(string)` | <pre>{<br>  "name_runner": "",<br>  "name_sg": ""<br>}</pre> | no |
| role\_path | The path that will be added to the role, if not set the environment name will be used. | `string` | `null` | no |
| role\_permissions\_boundary | Permissions boundary that will be added to the created role for the lambda. | `string` | `null` | no |
| runner\_additional\_security\_group\_ids | (optional) List of additional security groups IDs to apply to the runner | `list(string)` | `[]` | no |
| runner\_architecture | The platform architecture of the runner instance\_type. | `string` | `"x64"` | no |
| runner\_as\_root | Run the action runner under the root user. | `bool` | `false` | no |
| runner\_extra\_labels | Extra labels for the runners (GitHub). Separate each label by a comma | `string` | `""` | no |
| runner\_group\_name | Name of the runner group. | `string` | `"Default"` | no |
| runner\_iam\_role\_managed\_policy\_arns | Attach AWS or customer-managed IAM policies (by ARN) to the runner IAM role | `list(string)` | `[]` | no |
| runner\_log\_files | (optional) List of logfiles to send to cloudwatch, will only be used if `enable_cloudwatch_agent` is set to true. Object description: `log_group_name`: Name of the log group, `prefix_log_group`: If true, the log group name will be prefixed with `/github-self-hosted-runners/<var.environment>`, `file_path`: path to the log file, `log_stream_name`: name of the log stream. | <pre>list(object({<br>    log_group_name   = string<br>    prefix_log_group = bool<br>    file_path        = string<br>    log_stream_name  = string<br>  }))</pre> | <pre>[<br>  {<br>    "file_path": "/var/log/messages",<br>    "log_group_name": "messages",<br>    "log_stream_name": "{instance_id}",<br>    "prefix_log_group": true<br>  },<br>  {<br>    "file_path": "/var/log/user-data.log",<br>    "log_group_name": "user_data",<br>    "log_stream_name": "{instance_id}",<br>    "prefix_log_group": true<br>  },<br>  {<br>    "file_path": "/home/ec2-user/actions-runner/_diag/Runner_**.log",<br>    "log_group_name": "runner",<br>    "log_stream_name": "{instance_id}",<br>    "prefix_log_group": true<br>  }<br>]</pre> | no |
| runners\_lambda\_s3\_key | S3 key for runners lambda function. Required if using S3 bucket to specify lambdas. | `any` | `null` | no |
| runners\_lambda\_s3\_object\_version | S3 object version for runners lambda function. Useful if S3 versioning is enabled on source bucket. | `any` | `null` | no |
| runners\_maximum\_count | The maximum number of runners that will be created. | `number` | `3` | no |
| s3\_bucket\_runner\_binaries | n/a | <pre>object({<br>    arn = string<br>  })</pre> | n/a | yes |
| s3\_location\_runner\_binaries | S3 location of runner distribution. | `string` | n/a | yes |
| scale\_down\_schedule\_expression | Scheduler expression to check every x for scale down. | `string` | `"cron(*/5 * * * ? *)"` | no |
| sqs\_build\_queue | SQS queue to consume accepted build events. | <pre>object({<br>    arn = string<br>  })</pre> | n/a | yes |
| subnet\_ids | List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`. | `list(string)` | n/a | yes |
| tags | Map of tags that will be added to created resources. By default resources will be tagged with name and environment. | `map(string)` | `{}` | no |
| userdata\_post\_install | User-data script snippet to insert after GitHub acton runner install | `string` | `""` | no |
| userdata\_pre\_install | User-data script snippet to insert before GitHub acton runner install | `string` | `""` | no |
| userdata\_template | Alternative user-data template, replacing the default template. By providing your own user\_data you have to take care of installing all required software, including the action runner. Variables userdata\_pre/post\_install are ignored. | `string` | `null` | no |
| volume\_size | Size of runner volume | `number` | `30` | no |
| vpc\_id | The VPC for the security groups. | `string` | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| lambda\_scale\_down | n/a |
| lambda\_scale\_up | n/a |
| launch\_template | n/a |
| role\_runner | n/a |
| role\_scale\_down | n/a |
| role\_scale\_up | n/a |
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
