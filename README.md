# Terraform module Self-Hosted Scalable GitHub Actions runners on AWS.

[![docs](https://img.shields.io/badge/docs-runners-blue.svg)](https://philips-labs.github.io/terraform-aws-github-runner) [![awesome-runners](https://img.shields.io/badge/listed%20on-awesome--runners-blue.svg)](https://github.com/jonico/awesome-runners) [![Terraform registry](https://img.shields.io/github/v/release/philips-labs/terraform-aws-github-runner?label=Terraform%20Registry)](https://registry.terraform.io/modules/philips-labs/github-runner/aws/) [![Terraform checks](https://github.com/philips-labs/terraform-aws-github-runner/actions/workflows/terraform.yml/badge.svg)](https://github.com/philips-labs/terraform-aws-github-runner/actions/workflows/terraform.yml) [![Lambdas](https://github.com/philips-labs/terraform-aws-github-runner/actions/workflows/lambda.yml/badge.svg)](https://github.com/philips-labs/terraform-aws-github-runner/actions/workflows/lambda.yml)

> 📄 Extensive documentation is available via our [GitHub Pages Docs site](https://philips-labs.github.io/terraform-aws-github-runner/).

> 📢 We maintain the project as a truly open-source project. We maintain the project on a best effort basis. We welcome contributions from the community. Feel free to help us answering issues, reviewing PRs, or maintaining and improving the project.

> 📢 [`v5`](https://github.com/philips-labs/terraform-aws-github-runner/pull/3552) replaces Amazon Linux 2 with Amazon Linux 2023 as default OS. Check the PR for more details and other changes.

> 📢 For contributions to older versions you can make a PR to the related branch, e.g. `v4`. We have no release process in place for older versions.

This [Terraform](https://www.terraform.io/) module creates the required infrastructure needed to host [GitHub Actions](https://github.com/features/actions) self-hosted, auto-scaling runners on [AWS spot instances](https://aws.amazon.com/ec2/spot/). It provides the required logic to handle the life cycle for scaling up and down using a set of AWS Lambda functions. Runners are scaled down to zero to avoid costs when no workflows are active.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/runners.dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/runners.light.png">
  <img alt="Runners overview" src="docs/assets/runners.light.png">
</picture>

## Features

- Scaling: Scale up and down based on GitHub events
- Sustainability: Scale down to zero when no jobs are running
- Security: Runners are created on-demand and terminated after use (ephemeral runners)
- Cost optimization: Runners are created on spot instances
- Tailored software, hardware and network configuration: Bring your own AMI, define the instance types and subnets to use.
- OS support: Linux (x64/arm64) and Windows
- Multi-Runner: Create multiple runner configurations with a single deployment
- GitHub cloud and GitHub Enterprise Server (GHES) support.
- Org and repo level runners. enterprise level runners are not supported (yet).


## Getting started

Check out the detailed instructions in the [Getting Started](https://philips-labs.github.io/terraform-aws-github-runner/getting-started/) section of the docs. On a high level, the following steps are required to get started:
- Setup your AWS account
- Create and configure a GitHub App
- Download or build the required lambdas
- Deploy the module using Terraform
- Install the GitHub App to your organization or repositories and add your repositories to the runner group(s).

Check out the provided Terraform examples in the [examples](./examples) directory for different scenarios.

## Configuration

Please check the [configuration](https://philips-labs.github.io/terraform-aws-github-runner/configuration/) section of the docs for major configuration options. See the Terraform module documentation for all available options.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.

## Contributing

We welcome contributions, please check out the [contribution guide](CONTRIBUTING.md). Be aware we use [pre commit hooks](https://pre-commit.com/) to update the docs.

## Philips Forest

This module is part of the Philips Forest.

```plain
                                                     ___                   _
                                                    / __\__  _ __ ___  ___| |_
                                                   / _\/ _ \| '__/ _ \/ __| __|
                                                  / / | (_) | | |  __/\__ \ |_
                                                  \/   \___/|_|  \___||___/\__|

                                                                 Infrastructure
```

Talk to the forestkeepers in the `runners-channel` on Slack.

[![Slack](https://img.shields.io/badge/Slack-4A154B?style=for-the-badge&logo=slack&logoColor=white)](https://join.slack.com/t/philips-software/shared_invite/zt-xecw65v5-i1531hGP~mdVwgxLFx7ckg)


<details>
<summary>Terraform root module documention</summary>
<!-- --8<-- [start:mkdocsrunners] -->

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.27 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | 5.31.0 |
| <a name="provider_random"></a> [random](#provider\_random) | 3.6.0 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_ami_housekeeper"></a> [ami\_housekeeper](#module\_ami\_housekeeper) | ./modules/ami-housekeeper | n/a |
| <a name="module_instance_termination_watcher"></a> [instance\_termination\_watcher](#module\_instance\_termination\_watcher) | ./modules/termination-watcher | n/a |
| <a name="module_runner_binaries"></a> [runner\_binaries](#module\_runner\_binaries) | ./modules/runner-binaries-syncer | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ./modules/runners | n/a |
| <a name="module_ssm"></a> [ssm](#module\_ssm) | ./modules/ssm | n/a |
| <a name="module_webhook"></a> [webhook](#module\_webhook) | ./modules/webhook | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_sqs_queue.queued_builds](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue.queued_builds_dlq](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue.webhook_events_workflow_job_queue](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue_policy.build_queue_dlq_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue_policy) | resource |
| [aws_sqs_queue_policy.build_queue_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue_policy) | resource |
| [aws_sqs_queue_policy.webhook_events_workflow_job_queue_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue_policy) | resource |
| [random_string.random](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/string) | resource |
| [aws_iam_policy_document.deny_unsecure_transport](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_ami_filter"></a> [ami\_filter](#input\_ami\_filter) | Map of lists used to create the AMI filter for the action runner AMI. | `map(list(string))` | <pre>{<br>  "state": [<br>    "available"<br>  ]<br>}</pre> | no |
| <a name="input_ami_housekeeper_cleanup_config"></a> [ami\_housekeeper\_cleanup\_config](#input\_ami\_housekeeper\_cleanup\_config) | Configuration for AMI cleanup.<br><br>    `amiFilters` - Filters to use when searching for AMIs to cleanup. Default filter for images owned by the account and that are available.<br>    `dryRun` - If true, no AMIs will be deregistered. Default false.<br>    `launchTemplateNames` - Launch template names to use when searching for AMIs to cleanup. Default no launch templates.<br>    `maxItems` - The maximum numer of AMI's tha will be queried for cleanup. Default no maximum.<br>    `minimumDaysOld` - Minimum number of days old an AMI must be to be considered for cleanup. Default 30.<br>    `ssmParameterNames` - SSM parameter names to use when searching for AMIs to cleanup. This parameter should be set when using SSM to configure the AMI to use. Default no SSM parameters. | <pre>object({<br>    amiFilters = optional(list(object({<br>      Name   = string<br>      Values = list(string)<br>      })),<br>      [{<br>        Name : "state",<br>        Values : ["available"],<br>        },<br>        {<br>          Name : "image-type",<br>          Values : ["machine"],<br>      }]<br>    )<br>    dryRun              = optional(bool, false)<br>    launchTemplateNames = optional(list(string))<br>    maxItems            = optional(number)<br>    minimumDaysOld      = optional(number, 30)<br>    ssmParameterNames   = optional(list(string))<br>  })</pre> | `{}` | no |
| <a name="input_ami_housekeeper_lambda_s3_key"></a> [ami\_housekeeper\_lambda\_s3\_key](#input\_ami\_housekeeper\_lambda\_s3\_key) | S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas. | `string` | `null` | no |
| <a name="input_ami_housekeeper_lambda_s3_object_version"></a> [ami\_housekeeper\_lambda\_s3\_object\_version](#input\_ami\_housekeeper\_lambda\_s3\_object\_version) | S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket. | `string` | `null` | no |
| <a name="input_ami_housekeeper_lambda_schedule_expression"></a> [ami\_housekeeper\_lambda\_schedule\_expression](#input\_ami\_housekeeper\_lambda\_schedule\_expression) | Scheduler expression for action runner binary syncer. | `string` | `"rate(1 day)"` | no |
| <a name="input_ami_housekeeper_lambda_timeout"></a> [ami\_housekeeper\_lambda\_timeout](#input\_ami\_housekeeper\_lambda\_timeout) | Time out of the lambda in seconds. | `number` | `300` | no |
| <a name="input_ami_housekeeper_lambda_zip"></a> [ami\_housekeeper\_lambda\_zip](#input\_ami\_housekeeper\_lambda\_zip) | File location of the lambda zip file. | `string` | `null` | no |
| <a name="input_ami_id_ssm_parameter_name"></a> [ami\_id\_ssm\_parameter\_name](#input\_ami\_id\_ssm\_parameter\_name) | Externally managed SSM parameter (of data type aws:ec2:image) that contains the AMI ID to launch runner instances from. Overrides ami\_filter | `string` | `null` | no |
| <a name="input_ami_kms_key_arn"></a> [ami\_kms\_key\_arn](#input\_ami\_kms\_key\_arn) | Optional CMK Key ARN to be used to launch an instance from a shared encrypted AMI | `string` | `null` | no |
| <a name="input_ami_owners"></a> [ami\_owners](#input\_ami\_owners) | The list of owners used to select the AMI of action runner instances. | `list(string)` | <pre>[<br>  "amazon"<br>]</pre> | no |
| <a name="input_associate_public_ipv4_address"></a> [associate\_public\_ipv4\_address](#input\_associate\_public\_ipv4\_address) | Associate public IPv4 with the runner. Only tested with IPv4 | `bool` | `false` | no |
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | (optiona) partition in the arn namespace to use if not 'aws' | `string` | `"aws"` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region. | `string` | n/a | yes |
| <a name="input_block_device_mappings"></a> [block\_device\_mappings](#input\_block\_device\_mappings) | The EC2 instance block device configuration. Takes the following keys: `device_name`, `delete_on_termination`, `volume_type`, `volume_size`, `encrypted`, `iops`, `throughput`, `kms_key_id`, `snapshot_id`. | <pre>list(object({<br>    delete_on_termination = optional(bool, true)<br>    device_name           = optional(string, "/dev/xvda")<br>    encrypted             = optional(bool, true)<br>    iops                  = optional(number)<br>    kms_key_id            = optional(string)<br>    snapshot_id           = optional(string)<br>    throughput            = optional(number)<br>    volume_size           = number<br>    volume_type           = optional(string, "gp3")<br>  }))</pre> | <pre>[<br>  {<br>    "volume_size": 30<br>  }<br>]</pre> | no |
| <a name="input_cloudwatch_config"></a> [cloudwatch\_config](#input\_cloudwatch\_config) | (optional) Replaces the module's default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details. | `string` | `null` | no |
| <a name="input_create_service_linked_role_spot"></a> [create\_service\_linked\_role\_spot](#input\_create\_service\_linked\_role\_spot) | (optional) create the service linked role for spot instances that is required by the scale-up lambda. | `bool` | `false` | no |
| <a name="input_delay_webhook_event"></a> [delay\_webhook\_event](#input\_delay\_webhook\_event) | The number of seconds the event accepted by the webhook is invisible on the queue before the scale up lambda will receive the event. | `number` | `30` | no |
| <a name="input_disable_runner_autoupdate"></a> [disable\_runner\_autoupdate](#input\_disable\_runner\_autoupdate) | Disable the auto update of the github runner agent. Be aware there is a grace period of 30 days, see also the [GitHub article](https://github.blog/changelog/2022-02-01-github-actions-self-hosted-runners-can-now-disable-automatic-updates/) | `bool` | `false` | no |
| <a name="input_enable_ami_housekeeper"></a> [enable\_ami\_housekeeper](#input\_enable\_ami\_housekeeper) | Option to disable the lambda to clean up old AMIs. | `bool` | `false` | no |
| <a name="input_enable_cloudwatch_agent"></a> [enable\_cloudwatch\_agent](#input\_enable\_cloudwatch\_agent) | Enables the cloudwatch agent on the ec2 runner instances. The runner uses a default config that can be overridden via `cloudwatch_config`. | `bool` | `true` | no |
| <a name="input_enable_ephemeral_runners"></a> [enable\_ephemeral\_runners](#input\_enable\_ephemeral\_runners) | Enable ephemeral runners, runners will only be used once. | `bool` | `false` | no |
| <a name="input_enable_event_rule_binaries_syncer"></a> [enable\_event\_rule\_binaries\_syncer](#input\_enable\_event\_rule\_binaries\_syncer) | DEPRECATED: Replaced by `state_event_rule_binaries_syncer`. | `bool` | `null` | no |
| <a name="input_enable_fifo_build_queue"></a> [enable\_fifo\_build\_queue](#input\_enable\_fifo\_build\_queue) | Enable a FIFO queue to keep the order of events received by the webhook. Recommended for repo level runners. | `bool` | `false` | no |
| <a name="input_enable_jit_config"></a> [enable\_jit\_config](#input\_enable\_jit\_config) | Overwrite the default behavior for JIT configuration. By default JIT configuration is enabled for ephemeral runners and disabled for non-ephemeral runners. In case of GHES check first if the JIT config API is avaialbe. In case you upgradeing from 3.x to 4.x you can set `enable_jit_config` to `false` to avoid a breaking change when having your own AMI. | `bool` | `null` | no |
| <a name="input_enable_job_queued_check"></a> [enable\_job\_queued\_check](#input\_enable\_job\_queued\_check) | Only scale if the job event received by the scale up lambda is in the queued state. By default enabled for non ephemeral runners and disabled for ephemeral. Set this variable to overwrite the default behavior. | `bool` | `null` | no |
| <a name="input_enable_managed_runner_security_group"></a> [enable\_managed\_runner\_security\_group](#input\_enable\_managed\_runner\_security\_group) | Enables creation of the default managed security group. Unmanaged security groups can be specified via `runner_additional_security_group_ids`. | `bool` | `true` | no |
| <a name="input_enable_organization_runners"></a> [enable\_organization\_runners](#input\_enable\_organization\_runners) | Register runners to organization, instead of repo level | `bool` | `false` | no |
| <a name="input_enable_runner_binaries_syncer"></a> [enable\_runner\_binaries\_syncer](#input\_enable\_runner\_binaries\_syncer) | Option to disable the lambda to sync GitHub runner distribution, useful when using a pre-build AMI. | `bool` | `true` | no |
| <a name="input_enable_runner_detailed_monitoring"></a> [enable\_runner\_detailed\_monitoring](#input\_enable\_runner\_detailed\_monitoring) | Should detailed monitoring be enabled for the runner. Set this to true if you want to use detailed monitoring. See https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-cloudwatch-new.html for details. | `bool` | `false` | no |
| <a name="input_enable_runner_on_demand_failover_for_errors"></a> [enable\_runner\_on\_demand\_failover\_for\_errors](#input\_enable\_runner\_on\_demand\_failover\_for\_errors) | Enable on-demand failover. For example to fall back to on demand when no spot capacity is available the variable can be set to `InsufficientInstanceCapacity`. When not defined the default behavior is to retry later. | `list(string)` | `[]` | no |
| <a name="input_enable_runner_workflow_job_labels_check_all"></a> [enable\_runner\_workflow\_job\_labels\_check\_all](#input\_enable\_runner\_workflow\_job\_labels\_check\_all) | If set to true all labels in the workflow job must match the GitHub labels (os, architecture and `self-hosted`). When false if __any__ label matches it will trigger the webhook. | `bool` | `true` | no |
| <a name="input_enable_ssm_on_runners"></a> [enable\_ssm\_on\_runners](#input\_enable\_ssm\_on\_runners) | Enable to allow access to the runner instances for debugging purposes via SSM. Note that this adds additional permissions to the runner instances. | `bool` | `false` | no |
| <a name="input_enable_user_data_debug_logging_runner"></a> [enable\_user\_data\_debug\_logging\_runner](#input\_enable\_user\_data\_debug\_logging\_runner) | Option to enable debug logging for user-data, this logs all secrets as well. | `bool` | `false` | no |
| <a name="input_enable_userdata"></a> [enable\_userdata](#input\_enable\_userdata) | Should the userdata script be enabled for the runner. Set this to false if you are using your own prebuilt AMI. | `bool` | `true` | no |
| <a name="input_enable_workflow_job_events_queue"></a> [enable\_workflow\_job\_events\_queue](#input\_enable\_workflow\_job\_events\_queue) | Enabling this experimental feature will create a secondory sqs queue to which a copy of the workflow\_job event will be delivered. | `bool` | `false` | no |
| <a name="input_ghes_ssl_verify"></a> [ghes\_ssl\_verify](#input\_ghes\_ssl\_verify) | GitHub Enterprise SSL verification. Set to 'false' when custom certificate (chains) is used for GitHub Enterprise Server (insecure). | `bool` | `true` | no |
| <a name="input_ghes_url"></a> [ghes\_url](#input\_ghes\_url) | GitHub Enterprise Server URL. Example: https://github.internal.co - DO NOT SET IF USING PUBLIC GITHUB | `string` | `null` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub app parameters, see your github app. Ensure the key is the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`). | <pre>object({<br>    key_base64     = string<br>    id             = string<br>    webhook_secret = string<br>  })</pre> | n/a | yes |
| <a name="input_idle_config"></a> [idle\_config](#input\_idle\_config) | List of time periods, defined as a cron expression, to keep a minimum amount of runners active instead of scaling down to 0. By defining this list you can ensure that in time periods that match the cron expression within 5 seconds a runner is kept idle. | <pre>list(object({<br>    cron             = string<br>    timeZone         = string<br>    idleCount        = number<br>    evictionStrategy = optional(string, "oldest_first")<br>  }))</pre> | `[]` | no |
| <a name="input_instance_allocation_strategy"></a> [instance\_allocation\_strategy](#input\_instance\_allocation\_strategy) | The allocation strategy for spot instances. AWS recommends using `price-capacity-optimized` however the AWS default is `lowest-price`. | `string` | `"lowest-price"` | no |
| <a name="input_instance_max_spot_price"></a> [instance\_max\_spot\_price](#input\_instance\_max\_spot\_price) | Max price price for spot instances per hour. This variable will be passed to the create fleet as max spot price for the fleet. | `string` | `null` | no |
| <a name="input_instance_profile_path"></a> [instance\_profile\_path](#input\_instance\_profile\_path) | The path that will be added to the instance\_profile, if not set the environment name will be used. | `string` | `null` | no |
| <a name="input_instance_target_capacity_type"></a> [instance\_target\_capacity\_type](#input\_instance\_target\_capacity\_type) | Default lifecycle used for runner instances, can be either `spot` or `on-demand`. | `string` | `"spot"` | no |
| <a name="input_instance_termination_watcher"></a> [instance\_termination\_watcher](#input\_instance\_termination\_watcher) | Configuration for the instance termination watcher. This feature is Beta, changes will not trigger a major release as long in beta.<br><br>`enable`: Enable or disable the spot termination watcher.<br>'enable\_metrics': Enable or disable the metrics for the spot termination watcher.<br>`memory_size`: Memory size linit in MB of the lambda.<br>`s3_key`: S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas.<br>`s3_object_version`: S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket.<br>`timeout`: Time out of the lambda in seconds.<br>`zip`: File location of the lambda zip file. | <pre>object({<br>    enable = optional(bool, false)<br>    enable_metric = optional(object({<br>      spot_warning = optional(bool, false)<br>    }))<br>    memory_size       = optional(number, null)<br>    s3_key            = optional(string, null)<br>    s3_object_version = optional(string, null)<br>    timeout           = optional(number, null)<br>    zip               = optional(string, null)<br>  })</pre> | `{}` | no |
| <a name="input_instance_types"></a> [instance\_types](#input\_instance\_types) | List of instance types for the action runner. Defaults are based on runner\_os (al2023 for linux and Windows Server Core for win). | `list(string)` | <pre>[<br>  "m5.large",<br>  "c5.large"<br>]</pre> | no |
| <a name="input_job_queue_retention_in_seconds"></a> [job\_queue\_retention\_in\_seconds](#input\_job\_queue\_retention\_in\_seconds) | The number of seconds the job is held in the queue before it is purged. | `number` | `86400` | no |
| <a name="input_key_name"></a> [key\_name](#input\_key\_name) | Key pair name | `string` | `null` | no |
| <a name="input_kms_key_arn"></a> [kms\_key\_arn](#input\_kms\_key\_arn) | Optional CMK Key ARN to be used for Parameter Store. This key must be in the current account. | `string` | `null` | no |
| <a name="input_lambda_architecture"></a> [lambda\_architecture](#input\_lambda\_architecture) | AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86\_64' functions. | `string` | `"arm64"` | no |
| <a name="input_lambda_principals"></a> [lambda\_principals](#input\_lambda\_principals) | (Optional) add extra principals to the role created for execution of the lambda, e.g. for local testing. | <pre>list(object({<br>    type        = string<br>    identifiers = list(string)<br>  }))</pre> | `[]` | no |
| <a name="input_lambda_runtime"></a> [lambda\_runtime](#input\_lambda\_runtime) | AWS Lambda runtime. | `string` | `"nodejs20.x"` | no |
| <a name="input_lambda_s3_bucket"></a> [lambda\_s3\_bucket](#input\_lambda\_s3\_bucket) | S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly. | `string` | `null` | no |
| <a name="input_lambda_security_group_ids"></a> [lambda\_security\_group\_ids](#input\_lambda\_security\_group\_ids) | List of security group IDs associated with the Lambda function. | `list(string)` | `[]` | no |
| <a name="input_lambda_subnet_ids"></a> [lambda\_subnet\_ids](#input\_lambda\_subnet\_ids) | List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`. | `list(string)` | `[]` | no |
| <a name="input_lambda_tracing_mode"></a> [lambda\_tracing\_mode](#input\_lambda\_tracing\_mode) | DEPRECATED: Replaced by `tracing_config`. | `string` | `null` | no |
| <a name="input_log_level"></a> [log\_level](#input\_log\_level) | Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'. | `string` | `"info"` | no |
| <a name="input_logging_kms_key_id"></a> [logging\_kms\_key\_id](#input\_logging\_kms\_key\_id) | Specifies the kms key id to encrypt the logs with. | `string` | `null` | no |
| <a name="input_logging_retention_in_days"></a> [logging\_retention\_in\_days](#input\_logging\_retention\_in\_days) | Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653. | `number` | `180` | no |
| <a name="input_metrics_namespace"></a> [metrics\_namespace](#input\_metrics\_namespace) | The namespace for the metrics created by the module. Merics will only be created if explicit enabled. | `string` | `"GitHub Runners"` | no |
| <a name="input_minimum_running_time_in_minutes"></a> [minimum\_running\_time\_in\_minutes](#input\_minimum\_running\_time\_in\_minutes) | The time an ec2 action runner should be running at minimum before terminated, if not busy. | `number` | `null` | no |
| <a name="input_pool_config"></a> [pool\_config](#input\_pool\_config) | The configuration for updating the pool. The `pool_size` to adjust to by the events triggered by the `schedule_expression`. For example you can configure a cron expression for weekdays to adjust the pool to 10 and another expression for the weekend to adjust the pool to 1. | <pre>list(object({<br>    schedule_expression = string<br>    size                = number<br>  }))</pre> | `[]` | no |
| <a name="input_pool_lambda_memory_size"></a> [pool\_lambda\_memory\_size](#input\_pool\_lambda\_memory\_size) | Memory size limit for scale-up lambda. | `number` | `512` | no |
| <a name="input_pool_lambda_reserved_concurrent_executions"></a> [pool\_lambda\_reserved\_concurrent\_executions](#input\_pool\_lambda\_reserved\_concurrent\_executions) | Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations. | `number` | `1` | no |
| <a name="input_pool_lambda_timeout"></a> [pool\_lambda\_timeout](#input\_pool\_lambda\_timeout) | Time out for the pool lambda in seconds. | `number` | `60` | no |
| <a name="input_pool_runner_owner"></a> [pool\_runner\_owner](#input\_pool\_runner\_owner) | The pool will deploy runners to the GitHub org ID, set this value to the org to which you want the runners deployed. Repo level is not supported. | `string` | `null` | no |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | The prefix used for naming resources | `string` | `"github-actions"` | no |
| <a name="input_queue_encryption"></a> [queue\_encryption](#input\_queue\_encryption) | Configure how data on queues managed by the modules in ecrypted at REST. Options are encryped via SSE, non encrypted and via KMSS. By default encryptes via SSE is enabled. See for more details the Terraform `aws_sqs_queue` resource https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue. | <pre>object({<br>    kms_data_key_reuse_period_seconds = number<br>    kms_master_key_id                 = string<br>    sqs_managed_sse_enabled           = bool<br>  })</pre> | <pre>{<br>  "kms_data_key_reuse_period_seconds": null,<br>  "kms_master_key_id": null,<br>  "sqs_managed_sse_enabled": true<br>}</pre> | no |
| <a name="input_redrive_build_queue"></a> [redrive\_build\_queue](#input\_redrive\_build\_queue) | Set options to attach (optional) a dead letter queue to the build queue, the queue between the webhook and the scale up lambda. You have the following options. 1. Disable by setting `enabled` to false. 2. Enable by setting `enabled` to `true`, `maxReceiveCount` to a number of max retries. | <pre>object({<br>    enabled         = bool<br>    maxReceiveCount = number<br>  })</pre> | <pre>{<br>  "enabled": false,<br>  "maxReceiveCount": null<br>}</pre> | no |
| <a name="input_repository_white_list"></a> [repository\_white\_list](#input\_repository\_white\_list) | List of github repository full names (owner/repo\_name) that will be allowed to use the github app. Leave empty for no filtering. | `list(string)` | `[]` | no |
| <a name="input_role_path"></a> [role\_path](#input\_role\_path) | The path that will be added to role path for created roles, if not set the environment name will be used. | `string` | `null` | no |
| <a name="input_role_permissions_boundary"></a> [role\_permissions\_boundary](#input\_role\_permissions\_boundary) | Permissions boundary that will be added to the created roles. | `string` | `null` | no |
| <a name="input_runner_additional_security_group_ids"></a> [runner\_additional\_security\_group\_ids](#input\_runner\_additional\_security\_group\_ids) | (optional) List of additional security groups IDs to apply to the runner. | `list(string)` | `[]` | no |
| <a name="input_runner_architecture"></a> [runner\_architecture](#input\_runner\_architecture) | The platform architecture of the runner instance\_type. | `string` | `"x64"` | no |
| <a name="input_runner_as_root"></a> [runner\_as\_root](#input\_runner\_as\_root) | Run the action runner under the root user. Variable `runner_run_as` will be ignored. | `bool` | `false` | no |
| <a name="input_runner_binaries_s3_logging_bucket"></a> [runner\_binaries\_s3\_logging\_bucket](#input\_runner\_binaries\_s3\_logging\_bucket) | Bucket for action runner distribution bucket access logging. | `string` | `null` | no |
| <a name="input_runner_binaries_s3_logging_bucket_prefix"></a> [runner\_binaries\_s3\_logging\_bucket\_prefix](#input\_runner\_binaries\_s3\_logging\_bucket\_prefix) | Bucket prefix for action runner distribution bucket access logging. | `string` | `null` | no |
| <a name="input_runner_binaries_s3_sse_configuration"></a> [runner\_binaries\_s3\_sse\_configuration](#input\_runner\_binaries\_s3\_sse\_configuration) | Map containing server-side encryption configuration for runner-binaries S3 bucket. | `any` | <pre>{<br>  "rule": {<br>    "apply_server_side_encryption_by_default": {<br>      "sse_algorithm": "AES256"<br>    }<br>  }<br>}</pre> | no |
| <a name="input_runner_binaries_s3_versioning"></a> [runner\_binaries\_s3\_versioning](#input\_runner\_binaries\_s3\_versioning) | Status of S3 versioning for runner-binaries S3 bucket. Once set to Enabled the change cannot be reverted via Terraform! | `string` | `"Disabled"` | no |
| <a name="input_runner_binaries_syncer_lambda_memory_size"></a> [runner\_binaries\_syncer\_lambda\_memory\_size](#input\_runner\_binaries\_syncer\_lambda\_memory\_size) | Memory size limit in MB for binary syncer lambda. | `number` | `256` | no |
| <a name="input_runner_binaries_syncer_lambda_timeout"></a> [runner\_binaries\_syncer\_lambda\_timeout](#input\_runner\_binaries\_syncer\_lambda\_timeout) | Time out of the binaries sync lambda in seconds. | `number` | `300` | no |
| <a name="input_runner_binaries_syncer_lambda_zip"></a> [runner\_binaries\_syncer\_lambda\_zip](#input\_runner\_binaries\_syncer\_lambda\_zip) | File location of the binaries sync lambda zip file. | `string` | `null` | no |
| <a name="input_runner_boot_time_in_minutes"></a> [runner\_boot\_time\_in\_minutes](#input\_runner\_boot\_time\_in\_minutes) | The minimum time for an EC2 runner to boot and register as a runner. | `number` | `5` | no |
| <a name="input_runner_credit_specification"></a> [runner\_credit\_specification](#input\_runner\_credit\_specification) | The credit option for CPU usage of a T instance. Can be unset, "standard" or "unlimited". | `string` | `null` | no |
| <a name="input_runner_ec2_tags"></a> [runner\_ec2\_tags](#input\_runner\_ec2\_tags) | Map of tags that will be added to the launch template instance tag specifications. | `map(string)` | `{}` | no |
| <a name="input_runner_egress_rules"></a> [runner\_egress\_rules](#input\_runner\_egress\_rules) | List of egress rules for the GitHub runner instances. | <pre>list(object({<br>    cidr_blocks      = list(string)<br>    ipv6_cidr_blocks = list(string)<br>    prefix_list_ids  = list(string)<br>    from_port        = number<br>    protocol         = string<br>    security_groups  = list(string)<br>    self             = bool<br>    to_port          = number<br>    description      = string<br>  }))</pre> | <pre>[<br>  {<br>    "cidr_blocks": [<br>      "0.0.0.0/0"<br>    ],<br>    "description": null,<br>    "from_port": 0,<br>    "ipv6_cidr_blocks": [<br>      "::/0"<br>    ],<br>    "prefix_list_ids": null,<br>    "protocol": "-1",<br>    "security_groups": null,<br>    "self": null,<br>    "to_port": 0<br>  }<br>]</pre> | no |
| <a name="input_runner_extra_labels"></a> [runner\_extra\_labels](#input\_runner\_extra\_labels) | Extra (custom) labels for the runners (GitHub). Labels checks on the webhook can be enforced by setting `enable_runner_workflow_job_labels_check_all`. GitHub read-only labels should not be provided. | `list(string)` | `[]` | no |
| <a name="input_runner_group_name"></a> [runner\_group\_name](#input\_runner\_group\_name) | Name of the runner group. | `string` | `"Default"` | no |
| <a name="input_runner_iam_role_managed_policy_arns"></a> [runner\_iam\_role\_managed\_policy\_arns](#input\_runner\_iam\_role\_managed\_policy\_arns) | Attach AWS or customer-managed IAM policies (by ARN) to the runner IAM role | `list(string)` | `[]` | no |
| <a name="input_runner_log_files"></a> [runner\_log\_files](#input\_runner\_log\_files) | (optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details. | <pre>list(object({<br>    log_group_name   = string<br>    prefix_log_group = bool<br>    file_path        = string<br>    log_stream_name  = string<br>  }))</pre> | `null` | no |
| <a name="input_runner_metadata_options"></a> [runner\_metadata\_options](#input\_runner\_metadata\_options) | Metadata options for the ec2 runner instances. By default, the module uses metadata tags for bootstrapping the runner, only disable `instance_metadata_tags` when using custom scripts for starting the runner. | `map(any)` | <pre>{<br>  "http_endpoint": "enabled",<br>  "http_put_response_hop_limit": 1,<br>  "http_tokens": "required",<br>  "instance_metadata_tags": "enabled"<br>}</pre> | no |
| <a name="input_runner_name_prefix"></a> [runner\_name\_prefix](#input\_runner\_name\_prefix) | The prefix used for the GitHub runner name. The prefix will be used in the default start script to prefix the instance name when register the runner in GitHub. The value is availabe via an EC2 tag 'ghr:runner\_name\_prefix'. | `string` | `""` | no |
| <a name="input_runner_os"></a> [runner\_os](#input\_runner\_os) | The EC2 Operating System type to use for action runner instances (linux,windows). | `string` | `"linux"` | no |
| <a name="input_runner_run_as"></a> [runner\_run\_as](#input\_runner\_run\_as) | Run the GitHub actions agent as user. | `string` | `"ec2-user"` | no |
| <a name="input_runners_ebs_optimized"></a> [runners\_ebs\_optimized](#input\_runners\_ebs\_optimized) | Enable EBS optimization for the runner instances. | `bool` | `false` | no |
| <a name="input_runners_lambda_s3_key"></a> [runners\_lambda\_s3\_key](#input\_runners\_lambda\_s3\_key) | S3 key for runners lambda function. Required if using S3 bucket to specify lambdas. | `string` | `null` | no |
| <a name="input_runners_lambda_s3_object_version"></a> [runners\_lambda\_s3\_object\_version](#input\_runners\_lambda\_s3\_object\_version) | S3 object version for runners lambda function. Useful if S3 versioning is enabled on source bucket. | `string` | `null` | no |
| <a name="input_runners_lambda_zip"></a> [runners\_lambda\_zip](#input\_runners\_lambda\_zip) | File location of the lambda zip file for scaling runners. | `string` | `null` | no |
| <a name="input_runners_maximum_count"></a> [runners\_maximum\_count](#input\_runners\_maximum\_count) | The maximum number of runners that will be created. | `number` | `3` | no |
| <a name="input_runners_scale_down_lambda_memory_size"></a> [runners\_scale\_down\_lambda\_memory\_size](#input\_runners\_scale\_down\_lambda\_memory\_size) | Memory size limit in MB for scale-down lambda. | `number` | `512` | no |
| <a name="input_runners_scale_down_lambda_timeout"></a> [runners\_scale\_down\_lambda\_timeout](#input\_runners\_scale\_down\_lambda\_timeout) | Time out for the scale down lambda in seconds. | `number` | `60` | no |
| <a name="input_runners_scale_up_Lambda_memory_size"></a> [runners\_scale\_up\_Lambda\_memory\_size](#input\_runners\_scale\_up\_Lambda\_memory\_size) | Memory size limit in MB for scale-up lambda. | `number` | `null` | no |
| <a name="input_runners_scale_up_lambda_memory_size"></a> [runners\_scale\_up\_lambda\_memory\_size](#input\_runners\_scale\_up\_lambda\_memory\_size) | Memory size limit in MB for scale-up lambda. | `number` | `512` | no |
| <a name="input_runners_scale_up_lambda_timeout"></a> [runners\_scale\_up\_lambda\_timeout](#input\_runners\_scale\_up\_lambda\_timeout) | Time out for the scale up lambda in seconds. | `number` | `30` | no |
| <a name="input_runners_ssm_housekeeper"></a> [runners\_ssm\_housekeeper](#input\_runners\_ssm\_housekeeper) | Configuration for the SSM housekeeper lambda. This lambda deletes token / JIT config from SSM.<br><br>  `schedule_expression`: is used to configure the schedule for the lambda.<br>  `enabled`: enable or disable the lambda trigger via the EventBridge.<br>  `lambda_memory_size`: lambda memery size limit.<br>  `lambda_timeout`: timeout for the lambda in seconds.<br>  `config`: configuration for the lambda function. Token path will be read by default from the module. | <pre>object({<br>    schedule_expression = optional(string, "rate(1 day)")<br>    enabled             = optional(bool, true)<br>    lambda_memory_size  = optional(number, 512)<br>    lambda_timeout      = optional(number, 60)<br>    config = object({<br>      tokenPath      = optional(string)<br>      minimumDaysOld = optional(number, 1)<br>      dryRun         = optional(bool, false)<br>    })<br>  })</pre> | <pre>{<br>  "config": {}<br>}</pre> | no |
| <a name="input_scale_down_schedule_expression"></a> [scale\_down\_schedule\_expression](#input\_scale\_down\_schedule\_expression) | Scheduler expression to check every x for scale down. | `string` | `"cron(*/5 * * * ? *)"` | no |
| <a name="input_scale_up_reserved_concurrent_executions"></a> [scale\_up\_reserved\_concurrent\_executions](#input\_scale\_up\_reserved\_concurrent\_executions) | Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations. | `number` | `1` | no |
| <a name="input_ssm_paths"></a> [ssm\_paths](#input\_ssm\_paths) | The root path used in SSM to store configuration and secrets. | <pre>object({<br>    root       = optional(string, "github-action-runners")<br>    app        = optional(string, "app")<br>    runners    = optional(string, "runners")<br>    webhook    = optional(string, "webhook")<br>    use_prefix = optional(bool, true)<br>  })</pre> | `{}` | no |
| <a name="input_state_event_rule_binaries_syncer"></a> [state\_event\_rule\_binaries\_syncer](#input\_state\_event\_rule\_binaries\_syncer) | Option to disable EventBridge Lambda trigger for the binary syncer, useful to stop automatic updates of binary distribution | `string` | `"ENABLED"` | no |
| <a name="input_subnet_ids"></a> [subnet\_ids](#input\_subnet\_ids) | List of subnets in which the action runner instances will be launched. The subnets need to exist in the configured VPC (`vpc_id`), and must reside in different availability zones (see https://github.com/philips-labs/terraform-aws-github-runner/issues/2904) | `list(string)` | n/a | yes |
| <a name="input_syncer_lambda_s3_key"></a> [syncer\_lambda\_s3\_key](#input\_syncer\_lambda\_s3\_key) | S3 key for syncer lambda function. Required if using an S3 bucket to specify lambdas. | `string` | `null` | no |
| <a name="input_syncer_lambda_s3_object_version"></a> [syncer\_lambda\_s3\_object\_version](#input\_syncer\_lambda\_s3\_object\_version) | S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket. | `string` | `null` | no |
| <a name="input_tags"></a> [tags](#input\_tags) | Map of tags that will be added to created resources. By default resources will be tagged with name and environment. | `map(string)` | `{}` | no |
| <a name="input_tracing_config"></a> [tracing\_config](#input\_tracing\_config) | Configuration for lambda tracing. | <pre>object({<br>    mode                  = optional(string, null)<br>    capture_http_requests = optional(bool, false)<br>    capture_error         = optional(bool, false)<br>  })</pre> | `{}` | no |
| <a name="input_userdata_content"></a> [userdata\_content](#input\_userdata\_content) | Alternative user-data content, replacing the templated one. By providing your own user\_data you have to take care of installing all required software, including the action runner and registering the runner.  Be-aware configuration paramaters in SSM as well as tags are treated as internals. Changes will not trigger a breaking release. | `string` | `null` | no |
| <a name="input_userdata_post_install"></a> [userdata\_post\_install](#input\_userdata\_post\_install) | Script to be ran after the GitHub Actions runner is installed on the EC2 instances | `string` | `""` | no |
| <a name="input_userdata_pre_install"></a> [userdata\_pre\_install](#input\_userdata\_pre\_install) | Script to be ran before the GitHub Actions runner is installed on the EC2 instances | `string` | `""` | no |
| <a name="input_userdata_template"></a> [userdata\_template](#input\_userdata\_template) | Alternative user-data template file path, replacing the default template. By providing your own user\_data you have to take care of installing all required software, including the action runner. Variables userdata\_pre/post\_install are ignored. | `string` | `null` | no |
| <a name="input_vpc_id"></a> [vpc\_id](#input\_vpc\_id) | The VPC for security groups of the action runners. | `string` | n/a | yes |
| <a name="input_webhook_lambda_apigateway_access_log_settings"></a> [webhook\_lambda\_apigateway\_access\_log\_settings](#input\_webhook\_lambda\_apigateway\_access\_log\_settings) | Access log settings for webhook API gateway. | <pre>object({<br>    destination_arn = string<br>    format          = string<br>  })</pre> | `null` | no |
| <a name="input_webhook_lambda_memory_size"></a> [webhook\_lambda\_memory\_size](#input\_webhook\_lambda\_memory\_size) | Memory size limit in MB for webhook lambda in. | `number` | `256` | no |
| <a name="input_webhook_lambda_s3_key"></a> [webhook\_lambda\_s3\_key](#input\_webhook\_lambda\_s3\_key) | S3 key for webhook lambda function. Required if using S3 bucket to specify lambdas. | `string` | `null` | no |
| <a name="input_webhook_lambda_s3_object_version"></a> [webhook\_lambda\_s3\_object\_version](#input\_webhook\_lambda\_s3\_object\_version) | S3 object version for webhook lambda function. Useful if S3 versioning is enabled on source bucket. | `string` | `null` | no |
| <a name="input_webhook_lambda_timeout"></a> [webhook\_lambda\_timeout](#input\_webhook\_lambda\_timeout) | Time out of the webhook lambda in seconds. | `number` | `10` | no |
| <a name="input_webhook_lambda_zip"></a> [webhook\_lambda\_zip](#input\_webhook\_lambda\_zip) | File location of the webhook lambda zip file. | `string` | `null` | no |
| <a name="input_workflow_job_queue_configuration"></a> [workflow\_job\_queue\_configuration](#input\_workflow\_job\_queue\_configuration) | Configuration options for workflow job queue which is only applicable if the flag enable\_workflow\_job\_events\_queue is set to true. | <pre>object({<br>    delay_seconds              = number<br>    visibility_timeout_seconds = number<br>    message_retention_seconds  = number<br>  })</pre> | <pre>{<br>  "delay_seconds": null,<br>  "message_retention_seconds": null,<br>  "visibility_timeout_seconds": null<br>}</pre> | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_binaries_syncer"></a> [binaries\_syncer](#output\_binaries\_syncer) | n/a |
| <a name="output_instance_termination_watcher"></a> [instance\_termination\_watcher](#output\_instance\_termination\_watcher) | n/a |
| <a name="output_queues"></a> [queues](#output\_queues) | SQS queues. |
| <a name="output_runners"></a> [runners](#output\_runners) | n/a |
| <a name="output_ssm_parameters"></a> [ssm\_parameters](#output\_ssm\_parameters) | n/a |
| <a name="output_webhook"></a> [webhook](#output\_webhook) | n/a |
<!-- END_TF_DOCS -->
<!-- --8<-- [end:mkdocsrunners] -->

</details>
