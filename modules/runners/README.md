# Module - Scale runners

> This module is treated as internal module, breaking changes will not trigger a major release bump.

This module creates resources required to run the GitHub action runner on AWS EC2 spot instances. The life cycle of the runners on AWS is managed by two lambda functions. One function will handle scaling up, the other scaling down.

## Overview

### Action runners on EC2

The action runners are created via a launch template; in the launch template only the subnet needs to be provided. During launch the installation is handled via a user data script. The configuration is fetched from SSM parameter store.

### Lambda scale up

The scale up lambda is triggered by events on a SQS queue. Events on this queue are delayed, which will give the workflow some time to start running on available runners. For each event the lambda will check if the workflow is still queued and no other limits are reached. In that case the lambda will create a new EC2 instance. The lambda only needs to know which launch template to use and which subnets are available. From the available subnets a random one will be chosen. Once the instance is created the event is assumed as handled, and we assume the workflow wil start at some moment once the created instance is ready.

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

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.2 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | ~> 5.2 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_pool"></a> [pool](#module\_pool) | ./pool | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_cloudwatch_event_rule.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_target.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) | resource |
| [aws_cloudwatch_log_group.gh_runners](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_group.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_group.scale_up](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_iam_instance_profile.runner](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_instance_profile) | resource |
| [aws_iam_policy.ami_id_ssm_parameter_read](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_policy) | resource |
| [aws_iam_role.runner](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.scale_up](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.cloudwatch](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.describe_tags](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.dist_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.ec2](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.runner_session_manager_aws_managed](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_down_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_down_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_up](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_up_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_up_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.service_linked_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.ssm_parameters](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.ami_id_ssm_parameter_read](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.managed_policies](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.scale_down_vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.scale_up_vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_lambda_event_source_mapping.scale_up](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping) | resource |
| [aws_lambda_function.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_function.scale_up](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_permission.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_lambda_permission.scale_runners_lambda](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_launch_template.runner](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/launch_template) | resource |
| [aws_security_group.runner_sg](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group) | resource |
| [aws_ssm_parameter.cloudwatch_agent_config_runner](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.jit_config_enabled](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.runner_agent_mode](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.runner_config_run_as](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.runner_enable_cloudwatch](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.token_path](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ami.runner](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ami) | data source |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_iam_policy_document.lambda_assume_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.lambda_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_ami_filter"></a> [ami\_filter](#input\_ami\_filter) | Map of lists used to create the AMI filter for the action runner AMI. | `map(list(string))` | <pre>{<br>  "state": [<br>    "available"<br>  ]<br>}</pre> | no |
| <a name="input_ami_id_ssm_parameter_name"></a> [ami\_id\_ssm\_parameter\_name](#input\_ami\_id\_ssm\_parameter\_name) | Externally managed SSM parameter (of data type aws:ec2:image) that contains the AMI ID to launch runner instances from. Overrides ami\_filter | `string` | `null` | no |
| <a name="input_ami_kms_key_arn"></a> [ami\_kms\_key\_arn](#input\_ami\_kms\_key\_arn) | Optional CMK Key ARN to be used to launch an instance from a shared encrypted AMI | `string` | `null` | no |
| <a name="input_ami_owners"></a> [ami\_owners](#input\_ami\_owners) | The list of owners used to select the AMI of action runner instances. | `list(string)` | <pre>[<br>  "amazon"<br>]</pre> | no |
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | (optional) partition for the base arn if not 'aws' | `string` | `"aws"` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region. | `string` | n/a | yes |
| <a name="input_block_device_mappings"></a> [block\_device\_mappings](#input\_block\_device\_mappings) | The EC2 instance block device configuration. Takes the following keys: `device_name`, `delete_on_termination`, `volume_type`, `volume_size`, `encrypted`, `iops`, `throughput`, `kms_key_id`, `snapshot_id`. | <pre>list(object({<br>    delete_on_termination = optional(bool, true)<br>    device_name           = optional(string, "/dev/xvda")<br>    encrypted             = optional(bool, true)<br>    iops                  = optional(number)<br>    kms_key_id            = optional(string)<br>    snapshot_id           = optional(string)<br>    throughput            = optional(number)<br>    volume_size           = number<br>    volume_type           = optional(string, "gp3")<br>  }))</pre> | <pre>[<br>  {<br>    "volume_size": 30<br>  }<br>]</pre> | no |
| <a name="input_cloudwatch_config"></a> [cloudwatch\_config](#input\_cloudwatch\_config) | (optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details. | `string` | `null` | no |
| <a name="input_create_service_linked_role_spot"></a> [create\_service\_linked\_role\_spot](#input\_create\_service\_linked\_role\_spot) | (optional) create the service linked role for spot instances that is required by the scale-up lambda. | `bool` | `false` | no |
| <a name="input_credit_specification"></a> [credit\_specification](#input\_credit\_specification) | The credit option for CPU usage of a T instance. Can be unset, "standard" or "unlimited". | `string` | `null` | no |
| <a name="input_disable_runner_autoupdate"></a> [disable\_runner\_autoupdate](#input\_disable\_runner\_autoupdate) | Disable the auto update of the github runner agent. Be aware there is a grace period of 30 days, see also the [GitHub article](https://github.blog/changelog/2022-02-01-github-actions-self-hosted-runners-can-now-disable-automatic-updates/) | `bool` | `false` | no |
| <a name="input_egress_rules"></a> [egress\_rules](#input\_egress\_rules) | List of egress rules for the GitHub runner instances. | <pre>list(object({<br>    cidr_blocks      = list(string)<br>    ipv6_cidr_blocks = list(string)<br>    prefix_list_ids  = list(string)<br>    from_port        = number<br>    protocol         = string<br>    security_groups  = list(string)<br>    self             = bool<br>    to_port          = number<br>    description      = string<br>  }))</pre> | <pre>[<br>  {<br>    "cidr_blocks": [<br>      "0.0.0.0/0"<br>    ],<br>    "description": null,<br>    "from_port": 0,<br>    "ipv6_cidr_blocks": [<br>      "::/0"<br>    ],<br>    "prefix_list_ids": null,<br>    "protocol": "-1",<br>    "security_groups": null,<br>    "self": null,<br>    "to_port": 0<br>  }<br>]</pre> | no |
| <a name="input_enable_cloudwatch_agent"></a> [enable\_cloudwatch\_agent](#input\_enable\_cloudwatch\_agent) | Enabling the cloudwatch agent on the ec2 runner instances, the runner contains default config. Configuration can be overridden via `cloudwatch_config`. | `bool` | `true` | no |
| <a name="input_enable_ephemeral_runners"></a> [enable\_ephemeral\_runners](#input\_enable\_ephemeral\_runners) | Enable ephemeral runners, runners will only be used once. | `bool` | `false` | no |
| <a name="input_enable_jit_config"></a> [enable\_jit\_config](#input\_enable\_jit\_config) | Overwrite the default behavior for JIT configuration. By default JIT configuration is enabled for ephemeral runners and disabled for non-ephemeral runners. In case of GHES check first if the JIT config API is avaialbe. In case you upgradeing from 3.x to 4.x you can set `enable_jit_config` to `false` to avoid a breaking change when having your own AMI. | `bool` | `null` | no |
| <a name="input_enable_job_queued_check"></a> [enable\_job\_queued\_check](#input\_enable\_job\_queued\_check) | Only scale if the job event received by the scale up lambda is is in the state queued. By default enabled for non ephemeral runners and disabled for ephemeral. Set this variable to overwrite the default behavior. | `bool` | `null` | no |
| <a name="input_enable_managed_runner_security_group"></a> [enable\_managed\_runner\_security\_group](#input\_enable\_managed\_runner\_security\_group) | Enabling the default managed security group creation. Unmanaged security groups can be specified via `runner_additional_security_group_ids`. | `bool` | `true` | no |
| <a name="input_enable_organization_runners"></a> [enable\_organization\_runners](#input\_enable\_organization\_runners) | n/a | `bool` | n/a | yes |
| <a name="input_enable_runner_binaries_syncer"></a> [enable\_runner\_binaries\_syncer](#input\_enable\_runner\_binaries\_syncer) | Option to disable the lambda to sync GitHub runner distribution, useful when using a pre-build AMI. | `bool` | `true` | no |
| <a name="input_enable_runner_detailed_monitoring"></a> [enable\_runner\_detailed\_monitoring](#input\_enable\_runner\_detailed\_monitoring) | Enable detailed monitoring for runners | `bool` | `false` | no |
| <a name="input_enable_ssm_on_runners"></a> [enable\_ssm\_on\_runners](#input\_enable\_ssm\_on\_runners) | Enable to allow access to the runner instances for debugging purposes via SSM. Note that this adds additional permissions to the runner instances. | `bool` | n/a | yes |
| <a name="input_enable_user_data_debug_logging"></a> [enable\_user\_data\_debug\_logging](#input\_enable\_user\_data\_debug\_logging) | Option to enable debug logging for user-data, this logs all secrets as well. | `bool` | `false` | no |
| <a name="input_enable_userdata"></a> [enable\_userdata](#input\_enable\_userdata) | Should the userdata script be enabled for the runner. Set this to false if you are using your own prebuilt AMI | `bool` | `true` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | A name that identifies the environment, used as prefix and for tagging. | `string` | `null` | no |
| <a name="input_ghes_ssl_verify"></a> [ghes\_ssl\_verify](#input\_ghes\_ssl\_verify) | GitHub Enterprise SSL verification. Set to 'false' when custom certificate (chains) is used for GitHub Enterprise Server (insecure). | `bool` | `true` | no |
| <a name="input_ghes_url"></a> [ghes\_url](#input\_ghes\_url) | GitHub Enterprise Server URL. DO NOT SET IF USING PUBLIC GITHUB | `string` | `null` | no |
| <a name="input_github_app_parameters"></a> [github\_app\_parameters](#input\_github\_app\_parameters) | Parameter Store for GitHub App Parameters. | <pre>object({<br>    key_base64 = map(string)<br>    id         = map(string)<br>  })</pre> | n/a | yes |
| <a name="input_idle_config"></a> [idle\_config](#input\_idle\_config) | List of time period that can be defined as cron expression to keep a minimum amount of runners active instead of scaling down to 0. By defining this list you can ensure that in time periods that match the cron expression within 5 seconds a runner is kept idle. | <pre>list(object({<br>    cron      = string<br>    timeZone  = string<br>    idleCount = number<br>    evictionStrategy = optional(string, "oldest_first")<br>  }))</pre> | `[]` | no |
| <a name="input_instance_allocation_strategy"></a> [instance\_allocation\_strategy](#input\_instance\_allocation\_strategy) | The allocation strategy for spot instances. AWS recommends to use `capacity-optimized` however the AWS default is `lowest-price`. | `string` | `"lowest-price"` | no |
| <a name="input_instance_max_spot_price"></a> [instance\_max\_spot\_price](#input\_instance\_max\_spot\_price) | Max price price for spot intances per hour. This variable will be passed to the create fleet as max spot price for the fleet. | `string` | `null` | no |
| <a name="input_instance_profile_path"></a> [instance\_profile\_path](#input\_instance\_profile\_path) | The path that will be added to the instance\_profile, if not set the prefix will be used. | `string` | `null` | no |
| <a name="input_instance_target_capacity_type"></a> [instance\_target\_capacity\_type](#input\_instance\_target\_capacity\_type) | Default lifecyle used runner instances, can be either `spot` or `on-demand`. | `string` | `"spot"` | no |
| <a name="input_instance_type"></a> [instance\_type](#input\_instance\_type) | [DEPRECATED] See instance\_types. | `string` | `"m5.large"` | no |
| <a name="input_instance_types"></a> [instance\_types](#input\_instance\_types) | List of instance types for the action runner. Defaults are based on runner\_os (amzn2 for linux and Windows Server Core for win). | `list(string)` | `null` | no |
| <a name="input_key_name"></a> [key\_name](#input\_key\_name) | Key pair name | `string` | `null` | no |
| <a name="input_kms_key_arn"></a> [kms\_key\_arn](#input\_kms\_key\_arn) | Optional CMK Key ARN to be used for Parameter Store. | `string` | `null` | no |
| <a name="input_lambda_architecture"></a> [lambda\_architecture](#input\_lambda\_architecture) | AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86\_64' functions. | `string` | `"arm64"` | no |
| <a name="input_lambda_runtime"></a> [lambda\_runtime](#input\_lambda\_runtime) | AWS Lambda runtime. | `string` | `"nodejs18.x"` | no |
| <a name="input_lambda_s3_bucket"></a> [lambda\_s3\_bucket](#input\_lambda\_s3\_bucket) | S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly. | `string` | `null` | no |
| <a name="input_lambda_security_group_ids"></a> [lambda\_security\_group\_ids](#input\_lambda\_security\_group\_ids) | List of security group IDs associated with the Lambda function. | `list(string)` | `[]` | no |
| <a name="input_lambda_subnet_ids"></a> [lambda\_subnet\_ids](#input\_lambda\_subnet\_ids) | List of subnets in which the lambda will be launched, the subnets needs to be subnets in the `vpc_id`. | `list(string)` | `[]` | no |
| <a name="input_lambda_timeout_scale_down"></a> [lambda\_timeout\_scale\_down](#input\_lambda\_timeout\_scale\_down) | Time out for the scale down lambda in seconds. | `number` | `60` | no |
| <a name="input_lambda_timeout_scale_up"></a> [lambda\_timeout\_scale\_up](#input\_lambda\_timeout\_scale\_up) | Time out for the scale up lambda in seconds. | `number` | `60` | no |
| <a name="input_lambda_tracing_mode"></a> [lambda\_tracing\_mode](#input\_lambda\_tracing\_mode) | Enable X-Ray tracing for the lambda functions. | `string` | `null` | no |
| <a name="input_lambda_zip"></a> [lambda\_zip](#input\_lambda\_zip) | File location of the lambda zip file. | `string` | `null` | no |
| <a name="input_log_level"></a> [log\_level](#input\_log\_level) | Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'. | `string` | `"info"` | no |
| <a name="input_log_type"></a> [log\_type](#input\_log\_type) | Logging format for lambda logging. Valid values are 'json', 'pretty', 'hidden'. | `string` | `null` | no |
| <a name="input_logging_kms_key_id"></a> [logging\_kms\_key\_id](#input\_logging\_kms\_key\_id) | Specifies the kms key id to encrypt the logs with | `string` | `null` | no |
| <a name="input_logging_retention_in_days"></a> [logging\_retention\_in\_days](#input\_logging\_retention\_in\_days) | Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653. | `number` | `180` | no |
| <a name="input_metadata_options"></a> [metadata\_options](#input\_metadata\_options) | Metadata options for the ec2 runner instances. By default, the module uses metadata tags for bootstrapping the runner, only disable `instance_metadata_tags` when using custom scripts for starting the runner. | `map(any)` | <pre>{<br>  "http_endpoint": "enabled",<br>  "http_put_response_hop_limit": 1,<br>  "http_tokens": "optional",<br>  "instance_metadata_tags": "enabled"<br>}</pre> | no |
| <a name="input_minimum_running_time_in_minutes"></a> [minimum\_running\_time\_in\_minutes](#input\_minimum\_running\_time\_in\_minutes) | The time an ec2 action runner should be running at minimum before terminated if non busy. If not set the default is calculated based on the OS. | `number` | `null` | no |
| <a name="input_overrides"></a> [overrides](#input\_overrides) | This map provides the possibility to override some defaults. The following attributes are supported: `name_sg` overrides the `Name` tag for all security groups created by this module. `name_runner_agent_instance` overrides the `Name` tag for the ec2 instance defined in the auto launch configuration. `name_docker_machine_runners` overrides the `Name` tag spot instances created by the runner agent. | `map(string)` | <pre>{<br>  "name_runner": "",<br>  "name_sg": ""<br>}</pre> | no |
| <a name="input_pool_config"></a> [pool\_config](#input\_pool\_config) | The configuration for updating the pool. The `pool_size` to adjust to by the events triggered by the `schedule_expression`. For example you can configure a cron expression for week days to adjust the pool to 10 and another expression for the weekend to adjust the pool to 1. | <pre>list(object({<br>    schedule_expression = string<br>    size                = number<br>  }))</pre> | `[]` | no |
| <a name="input_pool_lambda_reserved_concurrent_executions"></a> [pool\_lambda\_reserved\_concurrent\_executions](#input\_pool\_lambda\_reserved\_concurrent\_executions) | Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations. | `number` | `1` | no |
| <a name="input_pool_lambda_timeout"></a> [pool\_lambda\_timeout](#input\_pool\_lambda\_timeout) | Time out for the pool lambda in seconds. | `number` | `60` | no |
| <a name="input_pool_runner_owner"></a> [pool\_runner\_owner](#input\_pool\_runner\_owner) | The pool will deploy runners to the GitHub org ID, set this value to the org to which you want the runners deployed. Repo level is not supported. | `string` | `null` | no |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | The prefix used for naming resources | `string` | `"github-actions"` | no |
| <a name="input_role_path"></a> [role\_path](#input\_role\_path) | The path that will be added to the role; if not set, the prefix will be used. | `string` | `null` | no |
| <a name="input_role_permissions_boundary"></a> [role\_permissions\_boundary](#input\_role\_permissions\_boundary) | Permissions boundary that will be added to the created role for the lambda. | `string` | `null` | no |
| <a name="input_runner_additional_security_group_ids"></a> [runner\_additional\_security\_group\_ids](#input\_runner\_additional\_security\_group\_ids) | (optional) List of additional security groups IDs to apply to the runner | `list(string)` | `[]` | no |
| <a name="input_runner_architecture"></a> [runner\_architecture](#input\_runner\_architecture) | The platform architecture of the runner instance\_type. | `string` | `"x64"` | no |
| <a name="input_runner_as_root"></a> [runner\_as\_root](#input\_runner\_as\_root) | Run the action runner under the root user. Variable `runner_run_as` will be ignored. | `bool` | `false` | no |
| <a name="input_runner_boot_time_in_minutes"></a> [runner\_boot\_time\_in\_minutes](#input\_runner\_boot\_time\_in\_minutes) | The minimum time for an EC2 runner to boot and register as a runner. | `number` | `5` | no |
| <a name="input_runner_ec2_tags"></a> [runner\_ec2\_tags](#input\_runner\_ec2\_tags) | Map of tags that will be added to the launch template instance tag specifications. | `map(string)` | `{}` | no |
| <a name="input_runner_group_name"></a> [runner\_group\_name](#input\_runner\_group\_name) | Name of the runner group. | `string` | `"Default"` | no |
| <a name="input_runner_iam_role_managed_policy_arns"></a> [runner\_iam\_role\_managed\_policy\_arns](#input\_runner\_iam\_role\_managed\_policy\_arns) | Attach AWS or customer-managed IAM policies (by ARN) to the runner IAM role | `list(string)` | `[]` | no |
| <a name="input_runner_labels"></a> [runner\_labels](#input\_runner\_labels) | All the labels for the runners (GitHub) including the default one's(e.g: self-hosted, linux, x64, label1, label2). Separate each label by a comma | `string` | n/a | yes |
| <a name="input_runner_log_files"></a> [runner\_log\_files](#input\_runner\_log\_files) | (optional) List of logfiles to send to CloudWatch, will only be used if `enable_cloudwatch_agent` is set to true. Object description: `log_group_name`: Name of the log group, `prefix_log_group`: If true, the log group name will be prefixed with `/github-self-hosted-runners/<var.prefix>`, `file_path`: path to the log file, `log_stream_name`: name of the log stream. | <pre>list(object({<br>    log_group_name   = string<br>    prefix_log_group = bool<br>    file_path        = string<br>    log_stream_name  = string<br>  }))</pre> | `null` | no |
| <a name="input_runner_name_prefix"></a> [runner\_name\_prefix](#input\_runner\_name\_prefix) | The prefix used for the GitHub runner name. The prefix will be used in the default start script to prefix the instance name when register the runner in GitHub. The value is availabe via an EC2 tag 'ghr:runner\_name\_prefix'. | `string` | `""` | no |
| <a name="input_runner_os"></a> [runner\_os](#input\_runner\_os) | The EC2 Operating System type to use for action runner instances (linux,windows). | `string` | `"linux"` | no |
| <a name="input_runner_run_as"></a> [runner\_run\_as](#input\_runner\_run\_as) | Run the GitHub actions agent as user. | `string` | `"ec2-user"` | no |
| <a name="input_runners_lambda_s3_key"></a> [runners\_lambda\_s3\_key](#input\_runners\_lambda\_s3\_key) | S3 key for runners lambda function. Required if using S3 bucket to specify lambdas. | `string` | `null` | no |
| <a name="input_runners_lambda_s3_object_version"></a> [runners\_lambda\_s3\_object\_version](#input\_runners\_lambda\_s3\_object\_version) | S3 object version for runners lambda function. Useful if S3 versioning is enabled on source bucket. | `string` | `null` | no |
| <a name="input_runners_maximum_count"></a> [runners\_maximum\_count](#input\_runners\_maximum\_count) | The maximum number of runners that will be created. | `number` | `3` | no |
| <a name="input_s3_runner_binaries"></a> [s3\_runner\_binaries](#input\_s3\_runner\_binaries) | Bucket details for cached GitHub binary. | <pre>object({<br>    arn = string<br>    id  = string<br>    key = string<br>  })</pre> | n/a | yes |
| <a name="input_scale_down_schedule_expression"></a> [scale\_down\_schedule\_expression](#input\_scale\_down\_schedule\_expression) | Scheduler expression to check every x for scale down. | `string` | `"cron(*/5 * * * ? *)"` | no |
| <a name="input_scale_up_reserved_concurrent_executions"></a> [scale\_up\_reserved\_concurrent\_executions](#input\_scale\_up\_reserved\_concurrent\_executions) | Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations. | `number` | `1` | no |
| <a name="input_sqs_build_queue"></a> [sqs\_build\_queue](#input\_sqs\_build\_queue) | SQS queue to consume accepted build events. | <pre>object({<br>    arn = string<br>  })</pre> | n/a | yes |
| <a name="input_ssm_paths"></a> [ssm\_paths](#input\_ssm\_paths) | The root path used in SSM to store configuration and secreets. | <pre>object({<br>    root   = string<br>    tokens = string<br>    config = string<br>  })</pre> | n/a | yes |
| <a name="input_subnet_ids"></a> [subnet\_ids](#input\_subnet\_ids) | List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`. | `list(string)` | n/a | yes |
| <a name="input_tags"></a> [tags](#input\_tags) | Map of tags that will be added to created resources. By default resources will be tagged with name. | `map(string)` | `{}` | no |
| <a name="input_userdata_post_install"></a> [userdata\_post\_install](#input\_userdata\_post\_install) | User-data script snippet to insert after GitHub action runner install | `string` | `""` | no |
| <a name="input_userdata_pre_install"></a> [userdata\_pre\_install](#input\_userdata\_pre\_install) | User-data script snippet to insert before GitHub action runner install | `string` | `""` | no |
| <a name="input_userdata_template"></a> [userdata\_template](#input\_userdata\_template) | Alternative user-data template, replacing the default template. By providing your own user\_data you have to take care of installing all required software, including the action runner. Variables userdata\_pre/post\_install are ignored. | `string` | `null` | no |
| <a name="input_vpc_id"></a> [vpc\_id](#input\_vpc\_id) | The VPC for the security groups. | `string` | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_lambda_pool"></a> [lambda\_pool](#output\_lambda\_pool) | n/a |
| <a name="output_lambda_pool_log_group"></a> [lambda\_pool\_log\_group](#output\_lambda\_pool\_log\_group) | n/a |
| <a name="output_lambda_scale_down"></a> [lambda\_scale\_down](#output\_lambda\_scale\_down) | n/a |
| <a name="output_lambda_scale_down_log_group"></a> [lambda\_scale\_down\_log\_group](#output\_lambda\_scale\_down\_log\_group) | n/a |
| <a name="output_lambda_scale_up"></a> [lambda\_scale\_up](#output\_lambda\_scale\_up) | n/a |
| <a name="output_lambda_scale_up_log_group"></a> [lambda\_scale\_up\_log\_group](#output\_lambda\_scale\_up\_log\_group) | n/a |
| <a name="output_launch_template"></a> [launch\_template](#output\_launch\_template) | n/a |
| <a name="output_logfiles"></a> [logfiles](#output\_logfiles) | List of logfiles to send to CloudWatch. Object description: `log_group_name`: Name of the log group, `file_path`: path to the log file, `log_stream_name`: name of the log stream. |
| <a name="output_role_pool"></a> [role\_pool](#output\_role\_pool) | n/a |
| <a name="output_role_runner"></a> [role\_runner](#output\_role\_runner) | n/a |
| <a name="output_role_scale_down"></a> [role\_scale\_down](#output\_role\_scale\_down) | n/a |
| <a name="output_role_scale_up"></a> [role\_scale\_up](#output\_role\_scale\_up) | n/a |
| <a name="output_runners_log_groups"></a> [runners\_log\_groups](#output\_runners\_log\_groups) | List of log groups from different log files of runner machine. |
<!-- END_TF_DOCS -->
