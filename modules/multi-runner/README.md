# Module - Multi runner

> This module replaces the top-level module to make it easy to create with one deployment multiple type of runners.

This module creates many runners with a single GitHub app. The module utilizes the internal modules and deploys parts of the stack for each runner defined.

The module takes a configuration as input containing a matcher for the labels. The [webhook](../webhook/README.md) lambda is using the configuration to delegate events based on the labels in the workflow job and sent them to a dedicated queue based on the configuration. Events on each queue are processed by a dedicated lambda per configuration to scale runners.

For each configuration:

- When enabled, the [distribution syncer](../runner-binaries-syncer/README.md) is deployed for each unique combination of OS and architecture.
- For each configuration a queue is created and [runner module](../runners/README.md) is deployed


## Matching

Matching of the configuration is done based on the labels specified in labelMatchers configuration. The webhook is processing the `workflow_job` event and match the labels against the labels specified in labelMatchers configuration in the order of configuration with exact-match true first, followed by all exact matches false.


## The catch

Controlling which event is taken up by which runner is not to this module. It is completely done by GitHub. This means when potentially different runners can run the same job there is nothing that can be done to guarantee a certain runner will take up the job.

An example, given you have two runners one with the labels. `self-hosted, linux, x64, large` and one with the labels `self-hosted, linux, x64, small`. Once you define a subset of the labels in the workflow, for example `self-hosted, linux, x64`. Both runners can take the job potentially. You can define to scale one of the runners for the event, but still there is no guarantee that the scaled runner takes the job. The workflow with subset of labels (`self-hosted, linux, x64`) can take up runner with specific labels (`self-hosted, linux, x64, large`) and leave the workflow with labels (`self-hosted, linux, x64, large`) be without the runner.
The only mitigation that is available right now is to use a small pool of runners. Pool instances can also exist for a short amount of time and only created once in x time based on a cron expression.


## Usages

A complete example is available in the examples, see the [multi-runner example](../../examples/multi-runner/) for actual implementation.


```hcl

module "multi-runner" {
  prefix = "multi-runner"

  github_app = {
    # app details
  }

  multi_runner_config = {
    "linux-arm" = {
      matcherConfig : {
        labelMatchers = [["self-hosted", "linux", "arm64", "arm"]]
        exactMatch    = true
      }
      runner_config = {
        runner_os                      = "linux"
        runner_architecture            = "arm64"
        runner_extra_labels            = "arm"
        enable_ssm_on_runners          = true
        instance_types                 = ["t4g.large", "c6g.large"]
        ...
      }
      ...
    },
    "linux-x64" = {
      matcherConfig : {
        labelMatchers = [["self-hosted", "linux", "x64"]]
        exactMatch    = false
      }
      runner_config = {
        runner_os                       = "linux"
        runner_architecture             = "x64"
        instance_types                  = ["m5ad.large", "m5a.large"]
        enable_ephemeral_runners        = true
        ...
      }
      delay_webhook_event = 0
      ...
    }
  }

}
```

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.2 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | ~> 5.2 |
| <a name="provider_random"></a> [random](#provider\_random) | ~> 3.0 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_runner_binaries"></a> [runner\_binaries](#module\_runner\_binaries) | ../runner-binaries-syncer | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ../runners | n/a |
| <a name="module_ssm"></a> [ssm](#module\_ssm) | ../ssm | n/a |
| <a name="module_webhook"></a> [webhook](#module\_webhook) | ../webhook | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_sqs_queue.queued_builds](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue.queued_builds_dlq](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue.webhook_events_workflow_job_queue](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue_policy.build_queue_dlq_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue_policy) | resource |
| [aws_sqs_queue_policy.build_queue_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue_policy) | resource |
| [random_string.random](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/string) | resource |
| [aws_iam_policy_document.deny_unsecure_transport](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | (optiona) partition in the arn namespace to use if not 'aws' | `string` | `"aws"` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region. | `string` | n/a | yes |
| <a name="input_cloudwatch_config"></a> [cloudwatch\_config](#input\_cloudwatch\_config) | (optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details. | `string` | `null` | no |
| <a name="input_enable_event_rule_binaries_syncer"></a> [enable\_event\_rule\_binaries\_syncer](#input\_enable\_event\_rule\_binaries\_syncer) | Option to disable EventBridge Lambda trigger for the binary syncer, useful to stop automatic updates of binary distribution | `bool` | `true` | no |
| <a name="input_enable_managed_runner_security_group"></a> [enable\_managed\_runner\_security\_group](#input\_enable\_managed\_runner\_security\_group) | Enabling the default managed security group creation. Unmanaged security groups can be specified via `runner_additional_security_group_ids`. | `bool` | `true` | no |
| <a name="input_enable_workflow_job_events_queue"></a> [enable\_workflow\_job\_events\_queue](#input\_enable\_workflow\_job\_events\_queue) | Enabling this experimental feature will create a secondory sqs queue to wich a copy of the workflow\_job event will be delivered. | `bool` | `false` | no |
| <a name="input_ghes_ssl_verify"></a> [ghes\_ssl\_verify](#input\_ghes\_ssl\_verify) | GitHub Enterprise SSL verification. Set to 'false' when custom certificate (chains) is used for GitHub Enterprise Server (insecure). | `bool` | `true` | no |
| <a name="input_ghes_url"></a> [ghes\_url](#input\_ghes\_url) | GitHub Enterprise Server URL. Example: https://github.internal.co - DO NOT SET IF USING PUBLIC GITHUB | `string` | `null` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub app parameters, see your github app. Ensure the key is the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`). | <pre>object({<br>    key_base64     = string<br>    id             = string<br>    webhook_secret = string<br>  })</pre> | n/a | yes |
| <a name="input_instance_profile_path"></a> [instance\_profile\_path](#input\_instance\_profile\_path) | The path that will be added to the instance\_profile, if not set the environment name will be used. | `string` | `null` | no |
| <a name="input_key_name"></a> [key\_name](#input\_key\_name) | Key pair name | `string` | `null` | no |
| <a name="input_kms_key_arn"></a> [kms\_key\_arn](#input\_kms\_key\_arn) | Optional CMK Key ARN to be used for Parameter Store. | `string` | `null` | no |
| <a name="input_lambda_architecture"></a> [lambda\_architecture](#input\_lambda\_architecture) | AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86\_64' functions. | `string` | `"arm64"` | no |
| <a name="input_lambda_principals"></a> [lambda\_principals](#input\_lambda\_principals) | (Optional) add extra principals to the role created for execution of the lambda, e.g. for local testing. | <pre>list(object({<br>    type        = string<br>    identifiers = list(string)<br>  }))</pre> | `[]` | no |
| <a name="input_lambda_runtime"></a> [lambda\_runtime](#input\_lambda\_runtime) | AWS Lambda runtime. | `string` | `"nodejs18.x"` | no |
| <a name="input_lambda_s3_bucket"></a> [lambda\_s3\_bucket](#input\_lambda\_s3\_bucket) | S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly. | `string` | `null` | no |
| <a name="input_lambda_security_group_ids"></a> [lambda\_security\_group\_ids](#input\_lambda\_security\_group\_ids) | List of security group IDs associated with the Lambda function. | `list(string)` | `[]` | no |
| <a name="input_lambda_subnet_ids"></a> [lambda\_subnet\_ids](#input\_lambda\_subnet\_ids) | List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`. | `list(string)` | `[]` | no |
| <a name="input_lambda_tracing_mode"></a> [lambda\_tracing\_mode](#input\_lambda\_tracing\_mode) | Enable X-Ray tracing for the lambda functions. | `string` | `null` | no |
| <a name="input_log_level"></a> [log\_level](#input\_log\_level) | Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'. | `string` | `"info"` | no |
| <a name="input_log_type"></a> [log\_type](#input\_log\_type) | Logging format for lambda logging. Valid values are 'json', 'pretty', 'hidden'. | `string` | `null` | no |
| <a name="input_logging_kms_key_id"></a> [logging\_kms\_key\_id](#input\_logging\_kms\_key\_id) | Specifies the kms key id to encrypt the logs with | `string` | `null` | no |
| <a name="input_logging_retention_in_days"></a> [logging\_retention\_in\_days](#input\_logging\_retention\_in\_days) | Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653. | `number` | `7` | no |
| <a name="input_multi_runner_config"></a> [multi\_runner\_config](#input\_multi\_runner\_config) | multi\_runner\_config = {<br>      runner\_config: {<br>        runner\_os: "The EC2 Operating System type to use for action runner instances (linux,windows)."<br>        runner\_architecture: "The platform architecture of the runner instance\_type."<br>        runner\_metadata\_options: "(Optional) Metadata options for the ec2 runner instances."<br>        ami\_filter: "(Optional) List of maps used to create the AMI filter for the action runner AMI. By default amazon linux 2 is used."<br>        ami\_owners: "(Optional) The list of owners used to select the AMI of action runner instances."<br>        create\_service\_linked\_role\_spot: (Optional) create the serviced linked role for spot instances that is required by the scale-up lambda.<br>        credit\_specification: "(Optional) The credit specification of the runner instance\_type. Can be unset, `standard` or `unlimited`.<br>        delay\_webhook\_event: "The number of seconds the event accepted by the webhook is invisible on the queue before the scale up lambda will receive the event."<br>        disable\_runner\_autoupdate: "Disable the auto update of the github runner agent. Be aware there is a grace period of 30 days, see also the [GitHub article](https://github.blog/changelog/2022-02-01-github-actions-self-hosted-runners-can-now-disable-automatic-updates/)"<br>        enable\_ephemeral\_runners: "Enable ephemeral runners, runners will only be used once."<br>        enable\_job\_queued\_check: "Enables JIT configuration for creating runners instead of registration token based registraton. JIT configuration will only be applied for ephemeral runners. By default JIT confiugration is enabled for ephemeral runners an can be disabled via this override. When running on GHES without support for JIT configuration this variable should be set to true for ephemeral runners."<br>        enable\_organization\_runners: "Register runners to organization, instead of repo level"<br>        enable\_runner\_binaries\_syncer: "Option to disable the lambda to sync GitHub runner distribution, useful when using a pre-build AMI."<br>        enable\_ssm\_on\_runners: "Enable to allow access the runner instances for debugging purposes via SSM. Note that this adds additional permissions to the runner instances."<br>        enable\_userdata: "Should the userdata script be enabled for the runner. Set this to false if you are using your own prebuilt AMI."<br>        instance\_allocation\_strategy: "The allocation strategy for spot instances. AWS recommends to use `capacity-optimized` however the AWS default is `lowest-price`."<br>        instance\_max\_spot\_price: "Max price price for spot intances per hour. This variable will be passed to the create fleet as max spot price for the fleet."<br>        instance\_target\_capacity\_type: "Default lifecycle used for runner instances, can be either `spot` or `on-demand`."<br>        instance\_types: "List of instance types for the action runner. Defaults are based on runner\_os (amzn2 for linux and Windows Server Core for win)."<br>        job\_queue\_retention\_in\_seconds: "The number of seconds the job is held in the queue before it is purged"<br>        minimum\_running\_time\_in\_minutes: "The time an ec2 action runner should be running at minimum before terminated if not busy."<br>        pool\_runner\_owner: "The pool will deploy runners to the GitHub org ID, set this value to the org to which you want the runners deployed. Repo level is not supported."<br>        runner\_additional\_security\_group\_ids: "List of additional security groups IDs to apply to the runner. If added outside the multi\_runner\_config block, the additional security group(s) will be applied to all runner configs. If added inside the multi\_runner\_config, the additional security group(s) will be applied to the individual runner."<br>        runner\_as\_root: "Run the action runner under the root user. Variable `runner_run_as` will be ignored."<br>        runner\_boot\_time\_in\_minutes: "The minimum time for an EC2 runner to boot and register as a runner."<br>        runner\_extra\_labels: "Extra (custom) labels for the runners (GitHub). Separate each label by a comma. Labels checks on the webhook can be enforced by setting `enable_workflow_job_labels_check`. GitHub read-only labels should not be provided."<br>        runner\_group\_name: "Name of the runner group."<br>        runner\_name\_prefix: "Prefix for the GitHub runner name."<br>        runner\_run\_as: "Run the GitHub actions agent as user."<br>        runners\_maximum\_count: "The maximum number of runners that will be created."<br>        scale\_down\_schedule\_expression: "Scheduler expression to check every x for scale down."<br>        scale\_up\_reserved\_concurrent\_executions: "Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations."<br>        userdata\_template: "Alternative user-data template, replacing the default template. By providing your own user\_data you have to take care of installing all required software, including the action runner. Variables userdata\_pre/post\_install are ignored."<br>        enable\_jit\_config "Overwrite the default behavior for JIT configuration. By default JIT configuration is enabled for ephemeral runners and disabled for non-ephemeral runners. In case of GHES check first if the JIT config API is avaialbe. In case you upgradeing from 3.x to 4.x you can set `enable_jit_config` to `false` to avoid a breaking change when having your own AMI."<br>        enable\_runner\_detailed\_monitoring: "Should detailed monitoring be enabled for the runner. Set this to true if you want to use detailed monitoring. See https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-cloudwatch-new.html for details."<br>        enable\_cloudwatch\_agent: "Enabling the cloudwatch agent on the ec2 runner instances, the runner contains default config. Configuration can be overridden via `cloudwatch_config`."<br>        userdata\_pre\_install: "Script to be ran before the GitHub Actions runner is installed on the EC2 instances"<br>        userdata\_post\_install: "Script to be ran after the GitHub Actions runner is installed on the EC2 instances"<br>        runner\_ec2\_tags: "Map of tags that will be added to the launch template instance tag specifications."<br>        runner\_iam\_role\_managed\_policy\_arns: "Attach AWS or customer-managed IAM policies (by ARN) to the runner IAM role"<br>        idle\_config: "List of time period that can be defined as cron expression to keep a minimum amount of runners active instead of scaling down to 0. By defining this list you can ensure that in time periods that match the cron expression within 5 seconds a runner is kept idle."<br>        runner\_log\_files: "(optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details."<br>        block\_device\_mappings: "The EC2 instance block device configuration. Takes the following keys: `device_name`, `delete_on_termination`, `volume_type`, `volume_size`, `encrypted`, `iops`, `throughput`, `kms_key_id`, `snapshot_id`."<br>        pool\_config: "The configuration for updating the pool. The `pool_size` to adjust to by the events triggered by the `schedule_expression`. For example you can configure a cron expression for week days to adjust the pool to 10 and another expression for the weekend to adjust the pool to 1."<br>      }<br>      matcherConfig: {<br>        labelMatchers: "The list of list of labels supported by the runner configuration. `[[self-hosted, linux, x64, example]]`"<br>        exactMatch: "If set to true all labels in the workflow job must match the GitHub labels (os, architecture and `self-hosted`). When false if __any__ workflow label matches it will trigger the webhook."<br>      }<br>      fifo: "Enable a FIFO queue to remain the order of events received by the webhook. Suggest to set to true for repo level runners."<br>      redrive\_build\_queue: "Set options to attach (optional) a dead letter queue to the build queue, the queue between the webhook and the scale up lambda. You have the following options. 1. Disable by setting `enabled` to false. 2. Enable by setting `enabled` to `true`, `maxReceiveCount` to a number of max retries."<br>    } | <pre>map(object({<br>    runner_config = object({<br>      runner_os           = string<br>      runner_architecture = string<br>      runner_metadata_options = optional(map(any), {<br>        instance_metadata_tags      = "enabled"<br>        http_endpoint               = "enabled"<br>        http_tokens                 = "optional"<br>        http_put_response_hop_limit = 1<br>      })<br>      ami_filter                              = optional(map(list(string)), { state = ["available"] })<br>      ami_owners                              = optional(list(string), ["amazon"])<br>      ami_id_ssm_parameter_name               = optional(string, null)<br>      ami_kms_key_arn                         = optional(string, "")<br>      create_service_linked_role_spot         = optional(bool, false)<br>      credit_specification                    = optional(string, null)<br>      delay_webhook_event                     = optional(number, 30)<br>      disable_runner_autoupdate               = optional(bool, false)<br>      enable_ephemeral_runners                = optional(bool, false)<br>      enable_job_queued_check                 = optional(bool, null)<br>      enable_organization_runners             = optional(bool, false)<br>      enable_runner_binaries_syncer           = optional(bool, true)<br>      enable_ssm_on_runners                   = optional(bool, false)<br>      enable_userdata                         = optional(bool, true)<br>      instance_allocation_strategy            = optional(string, "lowest-price")<br>      instance_max_spot_price                 = optional(string, null)<br>      instance_target_capacity_type           = optional(string, "spot")<br>      instance_types                          = list(string)<br>      job_queue_retention_in_seconds          = optional(number, 86400)<br>      minimum_running_time_in_minutes         = optional(number, null)<br>      pool_runner_owner                       = optional(string, null)<br>      runner_as_root                          = optional(bool, false)<br>      runner_boot_time_in_minutes             = optional(number, 5)<br>      runner_extra_labels                     = string<br>      runner_group_name                       = optional(string, "Default")<br>      runner_name_prefix                      = optional(string, "")<br>      runner_run_as                           = optional(string, "ec2-user")<br>      runners_maximum_count                   = number<br>      runner_additional_security_group_ids    = optional(list(string), [])<br>      scale_down_schedule_expression          = optional(string, "cron(*/5 * * * ? *)")<br>      scale_up_reserved_concurrent_executions = optional(number, 1)<br>      userdata_template                       = optional(string, null)<br>      enable_jit_config                       = optional(bool, null)<br>      enable_runner_detailed_monitoring       = optional(bool, false)<br>      enable_cloudwatch_agent                 = optional(bool, true)<br>      userdata_pre_install                    = optional(string, "")<br>      userdata_post_install                   = optional(string, "")<br>      runner_ec2_tags                         = optional(map(string), {})<br>      runner_iam_role_managed_policy_arns     = optional(list(string), [])<br>      idle_config = optional(list(object({<br>        cron      = string<br>        timeZone  = string<br>        idleCount = number<br>        evictionStrategy = optional(string, "oldest_first")<br>       })), [])<br>      runner_log_files = optional(list(object({<br>        log_group_name   = string<br>        prefix_log_group = bool<br>        file_path        = string<br>        log_stream_name  = string<br>      })), null)<br>      block_device_mappings = optional(list(object({<br>        delete_on_termination = bool<br>        device_name           = string<br>        encrypted             = bool<br>        iops                  = number<br>        kms_key_id            = string<br>        snapshot_id           = string<br>        throughput            = number<br>        volume_size           = number<br>        volume_type           = string<br>        })), [{<br>        delete_on_termination = true<br>        device_name           = "/dev/xvda"<br>        encrypted             = true<br>        iops                  = null<br>        kms_key_id            = null<br>        snapshot_id           = null<br>        throughput            = null<br>        volume_size           = 30<br>        volume_type           = "gp3"<br>      }])<br>      pool_config = optional(list(object({<br>        schedule_expression = string<br>        size                = number<br>      })), [])<br>    })<br><br>    matcherConfig = object({<br>      labelMatchers = list(list(string))<br>      exactMatch    = optional(bool, false)<br>    })<br>    fifo = optional(bool, false)<br>    redrive_build_queue = optional(object({<br>      enabled         = bool<br>      maxReceiveCount = number<br>      }), {<br>      enabled         = false<br>      maxReceiveCount = null<br>    })<br>  }))</pre> | n/a | yes |
| <a name="input_pool_lambda_reserved_concurrent_executions"></a> [pool\_lambda\_reserved\_concurrent\_executions](#input\_pool\_lambda\_reserved\_concurrent\_executions) | Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations. | `number` | `1` | no |
| <a name="input_pool_lambda_timeout"></a> [pool\_lambda\_timeout](#input\_pool\_lambda\_timeout) | Time out for the pool lambda in seconds. | `number` | `60` | no |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | The prefix used for naming resources | `string` | `"github-actions"` | no |
| <a name="input_queue_encryption"></a> [queue\_encryption](#input\_queue\_encryption) | Configure how data on queues managed by the modules in ecrypted at REST. Options are encryped via SSE, non encrypted and via KMSS. By default encryptes via SSE is enabled. See for more details the Terraform `aws_sqs_queue` resource https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue. | <pre>object({<br>    kms_data_key_reuse_period_seconds = number<br>    kms_master_key_id                 = string<br>    sqs_managed_sse_enabled           = bool<br>  })</pre> | <pre>{<br>  "kms_data_key_reuse_period_seconds": null,<br>  "kms_master_key_id": null,<br>  "sqs_managed_sse_enabled": true<br>}</pre> | no |
| <a name="input_repository_white_list"></a> [repository\_white\_list](#input\_repository\_white\_list) | List of github repository full names (owner/repo\_name) that will be allowed to use the github app. Leave empty for no filtering. | `list(string)` | `[]` | no |
| <a name="input_role_path"></a> [role\_path](#input\_role\_path) | The path that will be added to the role; if not set, the environment name will be used. | `string` | `null` | no |
| <a name="input_role_permissions_boundary"></a> [role\_permissions\_boundary](#input\_role\_permissions\_boundary) | Permissions boundary that will be added to the created role for the lambda. | `string` | `null` | no |
| <a name="input_runner_additional_security_group_ids"></a> [runner\_additional\_security\_group\_ids](#input\_runner\_additional\_security\_group\_ids) | (optional) List of additional security groups IDs to apply to the runner | `list(string)` | `[]` | no |
| <a name="input_runner_binaries_s3_sse_configuration"></a> [runner\_binaries\_s3\_sse\_configuration](#input\_runner\_binaries\_s3\_sse\_configuration) | Map containing server-side encryption configuration for runner-binaries S3 bucket. | `any` | <pre>{<br>  "rule": {<br>    "apply_server_side_encryption_by_default": {<br>      "sse_algorithm": "AES256"<br>    }<br>  }<br>}</pre> | no |
| <a name="input_runner_binaries_s3_versioning"></a> [runner\_binaries\_s3\_versioning](#input\_runner\_binaries\_s3\_versioning) | Status of S3 versioning for runner-binaries S3 bucket. Once set to Enabled the change cannot be reverted via Terraform! | `string` | `"Disabled"` | no |
| <a name="input_runner_binaries_syncer_lambda_timeout"></a> [runner\_binaries\_syncer\_lambda\_timeout](#input\_runner\_binaries\_syncer\_lambda\_timeout) | Time out of the binaries sync lambda in seconds. | `number` | `300` | no |
| <a name="input_runner_binaries_syncer_lambda_zip"></a> [runner\_binaries\_syncer\_lambda\_zip](#input\_runner\_binaries\_syncer\_lambda\_zip) | File location of the binaries sync lambda zip file. | `string` | `null` | no |
| <a name="input_runner_egress_rules"></a> [runner\_egress\_rules](#input\_runner\_egress\_rules) | List of egress rules for the GitHub runner instances. | <pre>list(object({<br>    cidr_blocks      = list(string)<br>    ipv6_cidr_blocks = list(string)<br>    prefix_list_ids  = list(string)<br>    from_port        = number<br>    protocol         = string<br>    security_groups  = list(string)<br>    self             = bool<br>    to_port          = number<br>    description      = string<br>  }))</pre> | <pre>[<br>  {<br>    "cidr_blocks": [<br>      "0.0.0.0/0"<br>    ],<br>    "description": null,<br>    "from_port": 0,<br>    "ipv6_cidr_blocks": [<br>      "::/0"<br>    ],<br>    "prefix_list_ids": null,<br>    "protocol": "-1",<br>    "security_groups": null,<br>    "self": null,<br>    "to_port": 0<br>  }<br>]</pre> | no |
| <a name="input_runners_lambda_s3_key"></a> [runners\_lambda\_s3\_key](#input\_runners\_lambda\_s3\_key) | S3 key for runners lambda function. Required if using S3 bucket to specify lambdas. | `string` | `null` | no |
| <a name="input_runners_lambda_s3_object_version"></a> [runners\_lambda\_s3\_object\_version](#input\_runners\_lambda\_s3\_object\_version) | S3 object version for runners lambda function. Useful if S3 versioning is enabled on source bucket. | `string` | `null` | no |
| <a name="input_runners_lambda_zip"></a> [runners\_lambda\_zip](#input\_runners\_lambda\_zip) | File location of the lambda zip file for scaling runners. | `string` | `null` | no |
| <a name="input_runners_scale_down_lambda_timeout"></a> [runners\_scale\_down\_lambda\_timeout](#input\_runners\_scale\_down\_lambda\_timeout) | Time out for the scale down lambda in seconds. | `number` | `60` | no |
| <a name="input_runners_scale_up_lambda_timeout"></a> [runners\_scale\_up\_lambda\_timeout](#input\_runners\_scale\_up\_lambda\_timeout) | Time out for the scale up lambda in seconds. | `number` | `30` | no |
| <a name="input_ssm_paths"></a> [ssm\_paths](#input\_ssm\_paths) | The root path used in SSM to store configuration and secreets. | <pre>object({<br>    root    = optional(string, "github-action-runners")<br>    app     = optional(string, "app")<br>    runners = optional(string, "runners")<br>  })</pre> | `{}` | no |
| <a name="input_subnet_ids"></a> [subnet\_ids](#input\_subnet\_ids) | List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`. | `list(string)` | n/a | yes |
| <a name="input_syncer_lambda_s3_key"></a> [syncer\_lambda\_s3\_key](#input\_syncer\_lambda\_s3\_key) | S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas. | `string` | `null` | no |
| <a name="input_syncer_lambda_s3_object_version"></a> [syncer\_lambda\_s3\_object\_version](#input\_syncer\_lambda\_s3\_object\_version) | S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket. | `string` | `null` | no |
| <a name="input_tags"></a> [tags](#input\_tags) | Map of tags that will be added to created resources. By default resources will be tagged with name and environment. | `map(string)` | `{}` | no |
| <a name="input_vpc_id"></a> [vpc\_id](#input\_vpc\_id) | The VPC for security groups of the action runners. | `string` | n/a | yes |
| <a name="input_webhook_lambda_apigateway_access_log_settings"></a> [webhook\_lambda\_apigateway\_access\_log\_settings](#input\_webhook\_lambda\_apigateway\_access\_log\_settings) | Access log settings for webhook API gateway. | <pre>object({<br>    destination_arn = string<br>    format          = string<br>  })</pre> | `null` | no |
| <a name="input_webhook_lambda_s3_key"></a> [webhook\_lambda\_s3\_key](#input\_webhook\_lambda\_s3\_key) | S3 key for webhook lambda function. Required if using S3 bucket to specify lambdas. | `string` | `null` | no |
| <a name="input_webhook_lambda_s3_object_version"></a> [webhook\_lambda\_s3\_object\_version](#input\_webhook\_lambda\_s3\_object\_version) | S3 object version for webhook lambda function. Useful if S3 versioning is enabled on source bucket. | `string` | `null` | no |
| <a name="input_webhook_lambda_timeout"></a> [webhook\_lambda\_timeout](#input\_webhook\_lambda\_timeout) | Time out of the lambda in seconds. | `number` | `10` | no |
| <a name="input_webhook_lambda_zip"></a> [webhook\_lambda\_zip](#input\_webhook\_lambda\_zip) | File location of the webhook lambda zip file. | `string` | `null` | no |
| <a name="input_workflow_job_queue_configuration"></a> [workflow\_job\_queue\_configuration](#input\_workflow\_job\_queue\_configuration) | Configuration options for workflow job queue which is only applicable if the flag enable\_workflow\_job\_events\_queue is set to true. | <pre>object({<br>    delay_seconds              = number<br>    visibility_timeout_seconds = number<br>    message_retention_seconds  = number<br>  })</pre> | <pre>{<br>  "delay_seconds": null,<br>  "message_retention_seconds": null,<br>  "visibility_timeout_seconds": null<br>}</pre> | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_binaries_syncer"></a> [binaries\_syncer](#output\_binaries\_syncer) | (Deprecated, no longer used), see binaries\_syncer\_map. |
| <a name="output_binaries_syncer_map"></a> [binaries\_syncer\_map](#output\_binaries\_syncer\_map) | n/a |
| <a name="output_queues"></a> [queues](#output\_queues) | SQS queues. |
| <a name="output_runners"></a> [runners](#output\_runners) | (Deprecated, no longer used), see runners\_map. |
| <a name="output_runners_map"></a> [runners\_map](#output\_runners\_map) | n/a |
| <a name="output_ssm_parameters"></a> [ssm\_parameters](#output\_ssm\_parameters) | n/a |
| <a name="output_webhook"></a> [webhook](#output\_webhook) | n/a |
<!-- END_TF_DOCS -->
