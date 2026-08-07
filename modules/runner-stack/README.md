# Module - Scale runners

> This module is treated as internal module, breaking changes will not trigger a major release bump.

This module creates a provider-neutral runner control plane and selects its compute implementation with `compute_provider.type`. Provider-owned settings are typed and nested under the selected provider block; for example, AMI, VPC, instance-profile, capacity, userdata, and runner-host logging settings live under `compute_provider.ec2`. EC2 is the only active provider today.

The common layer owns scale-up, scale-down, pool, job retry, Lambda execution roles, the runner IAM role and policy attachments, shared SSM configuration, and the SSM housekeeper. [`../compute-providers/ec2/runner-role`](../compute-providers/ec2/runner-role) supplies the EC2 runner-role trust and permission documents without depending on the role. The common layer creates or selects the role and attaches those policies, then passes the role into [`../compute-providers/ec2`](../compute-providers/ec2), which owns the instance profile, launch template, EC2 bootstrap parameters, runner log groups, and the EC2 environment and IAM fragments merged into the common Lambda resources. Future providers can implement the same two contracts without copying the control plane.

## Overview

### Action runners on EC2

The action runners are created via a launch template; in the launch template only the subnet needs to be provided. During launch the installation is handled via a user data script. The configuration is fetched from SSM parameter store.

### Lambda scale up

The scale up lambda is triggered by events on a SQS queue. Events on this queue are delayed, which will give the workflow some time to start running on available runners. For each event the lambda will check if the workflow is still queued and no other limits are reached. In that case the lambda will create a new EC2 instance. The lambda only needs to know which launch template to use and which subnets are available. From the available subnets a random one will be chosen. Once the instance is created the event is assumed as handled, and we assume the workflow wil start at some moment once the created instance is ready.

### Lambda scale down

The scale down lambda is triggered via a CloudWatch event. The event is triggered by a cron expression defined in the variable `scale_down_schedule_expression` (https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html). For scaling down GitHub does not provide a good API yet, therefore we run the scaling down based on this event every x minutes. Each time the lambda is triggered it tries to remove all runners older than x minutes (configurable) managed in this deployment. In case the runner can be removed from GitHub, which means it is not executing a workflow, the lambda will terminate the EC2 instance.

--8<-- "modules/runner-stack/scale-down-state-diagram.md:mkdocs_scale_down_state_diagram"

## Lambda Function

The Lambda function is written in [TypeScript](https://www.typescriptlang.org/) and requires Node 12.x and yarn. Sources are located in [./lambdas/runners]. Two lambda functions share the same sources, there is one entry point for `scaleDown` and another one for `scaleUp`.

### Install

```bash
cd lambdas/runners
yarn install
```

### Test

Test are implemented with [vitest][https://vitest.dev/]), calls to AWS and GitHub are mocked.

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
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.33 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_ec2"></a> [ec2](#module\_ec2) | ../compute-providers/ec2 | n/a |
| <a name="module_ec2_runner_role"></a> [ec2\_runner\_role](#module\_ec2\_runner\_role) | ../compute-providers/ec2/runner-role | n/a |
| <a name="module_job_retry"></a> [job\_retry](#module\_job\_retry) | ./job-retry | n/a |
| <a name="module_pool"></a> [pool](#module\_pool) | ./pool | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_cloudwatch_event_rule.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_rule.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_target.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) | resource |
| [aws_cloudwatch_event_target.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) | resource |
| [aws_cloudwatch_log_group.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_group.scale_up](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_group.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_iam_role.runner](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.scale_up](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.job_retry_sqs_publish](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.runner_provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_down_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_down_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_up](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_up_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_up_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.service_linked_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.ssm_housekeeper_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.ssm_housekeeper_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.ami_id_ssm_parameter_read](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.runner](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.scale_down_vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.scale_up_vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.ssm_housekeeper_vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_lambda_event_source_mapping.scale_up](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping) | resource |
| [aws_lambda_function.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_function.scale_up](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_function.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_permission.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_lambda_permission.scale_runners_lambda](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_lambda_permission.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_ssm_parameter.disable_default_labels](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.jit_config_enabled](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.runner_agent_mode](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.token_path](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_iam_policy_document.lambda_assume_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.lambda_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.scale_down_common](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.scale_down_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.scale_up](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.scale_up_common](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.scale_up_job_retry_publish](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.scale_up_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.ssm_housekeeper_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | (optional) partition for the base arn if not 'aws' | `string` | `"aws"` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region. | `string` | n/a | yes |
| <a name="input_compute_provider"></a> [compute\_provider](#input\_compute\_provider) | Typed compute-provider configuration. Provider-owned settings must remain inside the selected provider block. | <pre>object({<br/>    type = string<br/><br/>    ec2 = optional(object({<br/>      ami = optional(object({<br/>        filter               = optional(map(list(string)), { state = ["available"] })<br/>        owners               = optional(list(string), ["amazon"])<br/>        id_ssm_parameter_arn = optional(string, null)<br/>        kms_key_arn          = optional(string, null)<br/>      }), null)<br/>      vpc_id     = string<br/>      subnet_ids = list(string)<br/>      overrides = optional(object({<br/>        name_runner = optional(string, "")<br/>        name_sg     = optional(string, "")<br/>      }), {})<br/>      instance_profile = optional(object({<br/>        name = string<br/>      }), null)<br/>      instance_profile_path = optional(string, null)<br/>      s3_runner_binaries = optional(object({<br/>        arn = string<br/>        id  = string<br/>        key = string<br/>      }), null)<br/>      block_device_mappings = optional(list(object({<br/>        delete_on_termination      = optional(bool, true)<br/>        device_name                = optional(string, "/dev/xvda")<br/>        encrypted                  = optional(bool, true)<br/>        iops                       = optional(number)<br/>        kms_key_id                 = optional(string)<br/>        snapshot_id                = optional(string)<br/>        throughput                 = optional(number)<br/>        volume_initialization_rate = optional(number)<br/>        volume_size                = number<br/>        volume_type                = optional(string, "gp3")<br/>      })), [{ volume_size = 30 }])<br/>      ebs_optimized                        = optional(bool, false)<br/>      instance_target_capacity_type        = optional(string, "spot")<br/>      instance_allocation_strategy         = optional(string, "lowest-price")<br/>      instance_type_priorities             = optional(map(number), null)<br/>      instance_max_spot_price              = optional(string, null)<br/>      instance_types                       = list(string)<br/>      enable_userdata                      = optional(bool, true)<br/>      userdata_template                    = optional(string, null)<br/>      userdata_content                     = optional(string, null)<br/>      userdata_pre_install                 = optional(string, "")<br/>      userdata_post_install                = optional(string, "")<br/>      runner_hook_job_started              = optional(string, "")<br/>      runner_hook_job_completed            = optional(string, "")<br/>      enable_ssm_on_runners                = optional(bool, false)<br/>      create_service_linked_role_spot      = optional(bool, false)<br/>      enable_cloudwatch_agent              = optional(bool, true)<br/>      enable_managed_runner_security_group = optional(bool, true)<br/>      cloudwatch_config                    = optional(string, null)<br/>      runner_log_files = optional(list(object({<br/>        log_group_name   = string<br/>        prefix_log_group = bool<br/>        file_path        = string<br/>        log_stream_name  = string<br/>        log_class        = optional(string, "STANDARD")<br/>      })), null)<br/>      key_name                             = optional(string, null)<br/>      runner_additional_security_group_ids = optional(list(string), [])<br/>      enable_runner_detailed_monitoring    = optional(bool, false)<br/>      egress_rules = optional(list(object({<br/>        cidr_blocks      = list(string)<br/>        ipv6_cidr_blocks = list(string)<br/>        prefix_list_ids  = list(string)<br/>        from_port        = number<br/>        protocol         = string<br/>        security_groups  = list(string)<br/>        self             = bool<br/>        to_port          = number<br/>        description      = string<br/>        })), [{<br/>        cidr_blocks      = ["0.0.0.0/0"]<br/>        ipv6_cidr_blocks = ["::/0"]<br/>        prefix_list_ids  = null<br/>        from_port        = 0<br/>        protocol         = "-1"<br/>        security_groups  = null<br/>        self             = null<br/>        to_port          = 0<br/>        description      = null<br/>      }])<br/>      runner_ec2_tags = optional(map(string), {})<br/>      metadata_options = optional(object({<br/>        instance_metadata_tags      = optional(string, "enabled")<br/>        http_endpoint               = optional(string, "enabled")<br/>        http_tokens                 = optional(string, "required")<br/>        http_put_response_hop_limit = optional(number, 1)<br/>      }), {})<br/>      enable_runner_binaries_syncer  = optional(bool, true)<br/>      enable_user_data_debug_logging = optional(bool, false)<br/>      credit_specification           = optional(string, null)<br/>      cpu_options = optional(object({<br/>        core_count            = optional(number)<br/>        threads_per_core      = optional(number)<br/>        amd_sev_snp           = optional(string)<br/>        nested_virtualization = optional(string)<br/>      }), null)<br/>      placement = optional(object({<br/>        affinity                = optional(string)<br/>        availability_zone       = optional(string)<br/>        group_id                = optional(string)<br/>        group_name              = optional(string)<br/>        host_id                 = optional(string)<br/>        host_resource_group_arn = optional(string)<br/>        spread_domain           = optional(string)<br/>        tenancy                 = optional(string)<br/>        partition_number        = optional(number)<br/>      }), null)<br/>      license_specifications = optional(list(object({<br/>        license_configuration_arn = string<br/>      })), [])<br/>      associate_public_ipv4_address        = optional(bool, false)<br/>      enable_on_demand_failover_for_errors = optional(list(string), [])<br/>      scale_errors = optional(list(string), [<br/>        "UnfulfillableCapacity",<br/>        "MaxSpotInstanceCountExceeded",<br/>        "TargetCapacityLimitExceededException",<br/>        "RequestLimitExceeded",<br/>        "ResourceLimitExceeded",<br/>        "MaxSpotInstanceCountExceeded",<br/>        "MaxSpotFleetRequestCountExceeded",<br/>        "InsufficientInstanceCapacity",<br/>        "InsufficientCapacityOnHost",<br/>      ])<br/>      use_dedicated_host = optional(bool, false)<br/>    }), null)<br/>  })</pre> | n/a | yes |
| <a name="input_disable_runner_autoupdate"></a> [disable\_runner\_autoupdate](#input\_disable\_runner\_autoupdate) | Disable the auto update of the github runner agent. Be aware there is a grace period of 30 days, see also the [GitHub article](https://github.blog/changelog/2022-02-01-github-actions-self-hosted-runners-can-now-disable-automatic-updates/) | `bool` | `false` | no |
| <a name="input_enable_ephemeral_runners"></a> [enable\_ephemeral\_runners](#input\_enable\_ephemeral\_runners) | Enable ephemeral runners, runners will only be used once. | `bool` | `false` | no |
| <a name="input_enable_jit_config"></a> [enable\_jit\_config](#input\_enable\_jit\_config) | Overwrite the default behavior for JIT configuration. By default JIT configuration is enabled for ephemeral runners and disabled for non-ephemeral runners. In case of GHES check first if the JIT config API is available. In case you are upgrading from 3.x to 4.x you can set `enable_jit_config` to `false` to avoid a breaking change when having your own AMI. | `bool` | `null` | no |
| <a name="input_enable_job_queued_check"></a> [enable\_job\_queued\_check](#input\_enable\_job\_queued\_check) | Only scale if the job event received by the scale up lambda is is in the state queued. By default enabled for non ephemeral runners and disabled for ephemeral. Set this variable to overwrite the default behavior. | `bool` | `null` | no |
| <a name="input_enable_organization_runners"></a> [enable\_organization\_runners](#input\_enable\_organization\_runners) | Register runners to organization, instead of repo level | `bool` | n/a | yes |
| <a name="input_ghes_ssl_verify"></a> [ghes\_ssl\_verify](#input\_ghes\_ssl\_verify) | GitHub Enterprise SSL verification. Set to 'false' when custom certificate (chains) is used for GitHub Enterprise Server (insecure). | `bool` | `true` | no |
| <a name="input_ghes_url"></a> [ghes\_url](#input\_ghes\_url) | GitHub Enterprise Server URL. DO NOT SET IF USING PUBLIC GITHUB..However if you are using GitHub Enterprise Cloud with data-residency (ghe.com), set the endpoint here. Example - https://companyname.ghe.com\| | `string` | `null` | no |
| <a name="input_github_app_parameters"></a> [github\_app\_parameters](#input\_github\_app\_parameters) | Parameter Store for GitHub App Parameters. | <pre>object({<br/>    key_base64 = map(string)<br/>    id         = map(string)<br/>  })</pre> | n/a | yes |
| <a name="input_idle_config"></a> [idle\_config](#input\_idle\_config) | List of time period that can be defined as cron expression to keep a minimum amount of runners active instead of scaling down to 0. By defining this list you can ensure that in time periods that match the cron expression within 5 seconds a runner is kept idle. | <pre>list(object({<br/>    cron             = string<br/>    timeZone         = string<br/>    idleCount        = number<br/>    evictionStrategy = optional(string, "oldest_first")<br/>  }))</pre> | `[]` | no |
| <a name="input_job_retry"></a> [job\_retry](#input\_job\_retry) | Configure job retries. The configuration enables job retries (for ephemeral runners). After creating the instances a message will be published to a job retry queue. The job retry check lambda is checking after a delay if the job is queued. If not the message will be published again on the scale-up (build queue). Using this feature can impact the rate limit of the GitHub app.<br/><br/>`enable`: Enable or disable the job retry feature.<br/>`delay_in_seconds`: The delay in seconds before the job retry check lambda will check the job status.<br/>`delay_backoff`: The backoff factor for the delay.<br/>`lambda_memory_size`: Memory size limit in MB for the job retry check lambda.<br/>'lambda\_reserved\_concurrent\_executions': Amount of reserved concurrent executions for the job retry check lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations.<br/>`lambda_timeout`: Time out of the job retry check lambda in seconds.<br/>`max_attempts`: The maximum number of attempts to retry the job. | <pre>object({<br/>    enable                                = optional(bool, false)<br/>    delay_in_seconds                      = optional(number, 300)<br/>    delay_backoff                         = optional(number, 2)<br/>    lambda_memory_size                    = optional(number, 256)<br/>    lambda_reserved_concurrent_executions = optional(number, 1)<br/><br/>    lambda_timeout = optional(number, 30)<br/><br/>    max_attempts = optional(number, 1)<br/>  })</pre> | `{}` | no |
| <a name="input_kms_key_arn"></a> [kms\_key\_arn](#input\_kms\_key\_arn) | Optional CMK Key ARN to be used for Parameter Store. | `string` | `null` | no |
| <a name="input_lambda_architecture"></a> [lambda\_architecture](#input\_lambda\_architecture) | AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86\_64' functions. | `string` | `"arm64"` | no |
| <a name="input_lambda_event_source_mapping_batch_size"></a> [lambda\_event\_source\_mapping\_batch\_size](#input\_lambda\_event\_source\_mapping\_batch\_size) | Maximum number of records to pass to the lambda function in a single batch for the event source mapping. When not set, the AWS default of 10 events will be used. | `number` | `10` | no |
| <a name="input_lambda_event_source_mapping_maximum_batching_window_in_seconds"></a> [lambda\_event\_source\_mapping\_maximum\_batching\_window\_in\_seconds](#input\_lambda\_event\_source\_mapping\_maximum\_batching\_window\_in\_seconds) | Maximum amount of time to gather records before invoking the lambda function, in seconds. AWS requires this to be greater than 0 if batch\_size is greater than 10. Defaults to 0. | `number` | `0` | no |
| <a name="input_lambda_runtime"></a> [lambda\_runtime](#input\_lambda\_runtime) | AWS Lambda runtime. | `string` | `"nodejs24.x"` | no |
| <a name="input_lambda_s3_bucket"></a> [lambda\_s3\_bucket](#input\_lambda\_s3\_bucket) | S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly. | `string` | `null` | no |
| <a name="input_lambda_scale_down_memory_size"></a> [lambda\_scale\_down\_memory\_size](#input\_lambda\_scale\_down\_memory\_size) | Memory size limit in MB for scale down lambda. | `number` | `512` | no |
| <a name="input_lambda_scale_up_memory_size"></a> [lambda\_scale\_up\_memory\_size](#input\_lambda\_scale\_up\_memory\_size) | Memory size limit in MB for scale-up lambda. | `number` | `512` | no |
| <a name="input_lambda_security_group_ids"></a> [lambda\_security\_group\_ids](#input\_lambda\_security\_group\_ids) | List of security group IDs associated with the Lambda function. | `list(string)` | `[]` | no |
| <a name="input_lambda_subnet_ids"></a> [lambda\_subnet\_ids](#input\_lambda\_subnet\_ids) | List of subnets in which the lambda will be launched, the subnets needs to be subnets in the `vpc_id`. | `list(string)` | `[]` | no |
| <a name="input_lambda_tags"></a> [lambda\_tags](#input\_lambda\_tags) | Map of tags that will be added to all the lambda function resources. Note these are additional tags to the default tags. | `map(string)` | `{}` | no |
| <a name="input_lambda_timeout_scale_down"></a> [lambda\_timeout\_scale\_down](#input\_lambda\_timeout\_scale\_down) | Time out for the scale down lambda in seconds. | `number` | `60` | no |
| <a name="input_lambda_timeout_scale_up"></a> [lambda\_timeout\_scale\_up](#input\_lambda\_timeout\_scale\_up) | Time out for the scale up lambda in seconds. | `number` | `60` | no |
| <a name="input_lambda_zip"></a> [lambda\_zip](#input\_lambda\_zip) | File location of the lambda zip file. | `string` | `null` | no |
| <a name="input_log_class"></a> [log\_class](#input\_log\_class) | The log class of the CloudWatch log groups for the lambda functions. Valid values are `STANDARD` or `INFREQUENT_ACCESS`. | `string` | `"STANDARD"` | no |
| <a name="input_log_level"></a> [log\_level](#input\_log\_level) | Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'. | `string` | `"info"` | no |
| <a name="input_logging_kms_key_id"></a> [logging\_kms\_key\_id](#input\_logging\_kms\_key\_id) | Specifies the kms key id to encrypt the logs with | `string` | `null` | no |
| <a name="input_logging_retention_in_days"></a> [logging\_retention\_in\_days](#input\_logging\_retention\_in\_days) | Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653. | `number` | `180` | no |
| <a name="input_metrics"></a> [metrics](#input\_metrics) | Configuration for metrics created by the module, by default metrics are disabled to avoid additional costs. When metrics are enable all metrics are created unless explicit configured otherwise. | <pre>object({<br/>    enable    = optional(bool, false)<br/>    namespace = optional(string, "GitHub Runners")<br/>    metric = optional(object({<br/>      enable_github_app_rate_limit    = optional(bool, true)<br/>      enable_job_retry                = optional(bool, true)<br/>      enable_spot_termination_warning = optional(bool, true)<br/>    }), {})<br/>  })</pre> | `{}` | no |
| <a name="input_minimum_running_time_in_minutes"></a> [minimum\_running\_time\_in\_minutes](#input\_minimum\_running\_time\_in\_minutes) | Minimum time a runner should remain active before it can be terminated while idle. If unset, the default is calculated from runner\_os. | `number` | `null` | no |
| <a name="input_parameter_store_tags"></a> [parameter\_store\_tags](#input\_parameter\_store\_tags) | Map of tags that will be added to all the SSM Parameter Store parameters created by the Lambda function. | `map(string)` | `{}` | no |
| <a name="input_pool_config"></a> [pool\_config](#input\_pool\_config) | The configuration for updating the pool. The `pool_size` to adjust to by the events triggered by the `schedule_expression`. For example you can configure a cron expression for week days to adjust the pool to 10 and another expression for the weekend to adjust the pool to 1. Use `schedule_expression_timezone ` to override the schedule time zone (defaults to UTC). | <pre>list(object({<br/>    schedule_expression          = string<br/>    schedule_expression_timezone = optional(string)<br/>    size                         = number<br/>  }))</pre> | `[]` | no |
| <a name="input_pool_include_busy_runners"></a> [pool\_include\_busy\_runners](#input\_pool\_include\_busy\_runners) | Include busy runners in the pool calculation. By default busy runners are not included in the pool. | `bool` | `false` | no |
| <a name="input_pool_lambda_memory_size"></a> [pool\_lambda\_memory\_size](#input\_pool\_lambda\_memory\_size) | Lambda Memory size limit in MB for pool lambda | `number` | `512` | no |
| <a name="input_pool_lambda_reserved_concurrent_executions"></a> [pool\_lambda\_reserved\_concurrent\_executions](#input\_pool\_lambda\_reserved\_concurrent\_executions) | Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations. | `number` | `1` | no |
| <a name="input_pool_lambda_timeout"></a> [pool\_lambda\_timeout](#input\_pool\_lambda\_timeout) | Time out for the pool lambda in seconds. | `number` | `60` | no |
| <a name="input_pool_runner_owner"></a> [pool\_runner\_owner](#input\_pool\_runner\_owner) | The pool will deploy runners to the GitHub org ID, set this value to the org to which you want the runners deployed. Repo level is not supported. | `string` | `null` | no |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | The prefix used for naming resources | `string` | `"github-actions"` | no |
| <a name="input_role_path"></a> [role\_path](#input\_role\_path) | The path that will be added to the role; if not set, the prefix will be used. | `string` | `null` | no |
| <a name="input_role_permissions_boundary"></a> [role\_permissions\_boundary](#input\_role\_permissions\_boundary) | Permissions boundary that will be added to the created role for the lambda. | `string` | `null` | no |
| <a name="input_runner_architecture"></a> [runner\_architecture](#input\_runner\_architecture) | Platform architecture used for runner labels and provider bootstrap. | `string` | `"x64"` | no |
| <a name="input_runner_as_root"></a> [runner\_as\_root](#input\_runner\_as\_root) | Run the action runner under the root user. Variable `runner_run_as` will be ignored. | `bool` | `false` | no |
| <a name="input_runner_boot_time_in_minutes"></a> [runner\_boot\_time\_in\_minutes](#input\_runner\_boot\_time\_in\_minutes) | Minimum time for a compute runner to boot and register. | `number` | `5` | no |
| <a name="input_runner_disable_default_labels"></a> [runner\_disable\_default\_labels](#input\_runner\_disable\_default\_labels) | Disable default labels for the runners (os, architecture and `self-hosted`). If enabled, the runner will only have the extra labels provided in `runner_extra_labels`. | `bool` | `false` | no |
| <a name="input_runner_group_name"></a> [runner\_group\_name](#input\_runner\_group\_name) | Name of the runner group. | `string` | `"Default"` | no |
| <a name="input_runner_iam"></a> [runner\_iam](#input\_runner\_iam) | Common runner-role configuration. Provider and user-managed policies are attached only when the runner stack creates the role; an external role must already contain all required policies. | <pre>object({<br/>    role = optional(object({<br/>      arn = string<br/>    }), null)<br/>    managed_policy_arns = optional(map(string), {})<br/>  })</pre> | `{}` | no |
| <a name="input_runner_labels"></a> [runner\_labels](#input\_runner\_labels) | All the labels for the runners (GitHub) including the default one's(e.g: self-hosted, linux, x64, label1, label2). Separate each label by a comma | `list(string)` | n/a | yes |
| <a name="input_runner_name_prefix"></a> [runner\_name\_prefix](#input\_runner\_name\_prefix) | The prefix used for the GitHub runner name. The prefix will be used in the default start script to prefix the instance name when register the runner in GitHub. The value is available via an EC2 tag 'ghr:runner\_name\_prefix'. | `string` | `""` | no |
| <a name="input_runner_os"></a> [runner\_os](#input\_runner\_os) | Operating system used for runner labels and provider bootstrap (linux, osx, windows). | `string` | `"linux"` | no |
| <a name="input_runner_run_as"></a> [runner\_run\_as](#input\_runner\_run\_as) | Run the GitHub actions agent as user. | `string` | `"ec2-user"` | no |
| <a name="input_runners_lambda_s3_key"></a> [runners\_lambda\_s3\_key](#input\_runners\_lambda\_s3\_key) | S3 key for runners lambda function. Required if using S3 bucket to specify lambdas. | `string` | `null` | no |
| <a name="input_runners_lambda_s3_object_version"></a> [runners\_lambda\_s3\_object\_version](#input\_runners\_lambda\_s3\_object\_version) | S3 object version for runners lambda function. Useful if S3 versioning is enabled on source bucket. | `string` | `null` | no |
| <a name="input_runners_maximum_count"></a> [runners\_maximum\_count](#input\_runners\_maximum\_count) | The maximum number of runners that will be created. Setting the variable to `-1` desiables the maximum check. | `number` | `3` | no |
| <a name="input_scale_down_schedule_expression"></a> [scale\_down\_schedule\_expression](#input\_scale\_down\_schedule\_expression) | Scheduler expression to check every x for scale down. | `string` | `"cron(*/5 * * * ? *)"` | no |
| <a name="input_scale_up_reserved_concurrent_executions"></a> [scale\_up\_reserved\_concurrent\_executions](#input\_scale\_up\_reserved\_concurrent\_executions) | Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations. | `number` | `1` | no |
| <a name="input_sqs_build_queue"></a> [sqs\_build\_queue](#input\_sqs\_build\_queue) | SQS queue to consume accepted build events. | <pre>object({<br/>    arn = string<br/>    url = string<br/>  })</pre> | n/a | yes |
| <a name="input_ssm_housekeeper"></a> [ssm\_housekeeper](#input\_ssm\_housekeeper) | Configuration for the SSM housekeeper lambda. This lambda deletes token / JIT config from SSM.<br/><br/>  `schedule_expression`: is used to configure the schedule for the lambda.<br/>  `state`: state of the cloudwatch event rule. Valid values are `DISABLED`, `ENABLED`, and `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS`.<br/>  `lambda_memory_size`: lambda memory size limit.<br/>  `lambda_timeout`: timeout for the lambda in seconds.<br/>  `config`: configuration for the lambda function. Token path will be read by default from the module. | <pre>object({<br/>    schedule_expression = optional(string, "rate(1 day)")<br/>    state               = optional(string, "ENABLED")<br/>    lambda_memory_size  = optional(number, 512)<br/>    lambda_timeout      = optional(number, 60)<br/>    config = object({<br/>      tokenPath      = optional(string)<br/>      minimumDaysOld = optional(number, 1)<br/>      dryRun         = optional(bool, false)<br/>    })<br/>  })</pre> | <pre>{<br/>  "config": {}<br/>}</pre> | no |
| <a name="input_ssm_paths"></a> [ssm\_paths](#input\_ssm\_paths) | The root path used in SSM to store configuration and secrets. | <pre>object({<br/>    root   = string<br/>    tokens = string<br/>    config = string<br/>  })</pre> | n/a | yes |
| <a name="input_tags"></a> [tags](#input\_tags) | Map of tags that will be added to created resources. By default resources will be tagged with name. | `map(string)` | `{}` | no |
| <a name="input_tracing_config"></a> [tracing\_config](#input\_tracing\_config) | Configuration for lambda tracing. | <pre>object({<br/>    mode                  = optional(string, null)<br/>    capture_http_requests = optional(bool, false)<br/>    capture_error         = optional(bool, false)<br/>  })</pre> | `{}` | no |
| <a name="input_user_agent"></a> [user\_agent](#input\_user\_agent) | User agent used for API calls. | `string` | `null` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_lambda_pool"></a> [lambda\_pool](#output\_lambda\_pool) | n/a |
| <a name="output_lambda_pool_log_group"></a> [lambda\_pool\_log\_group](#output\_lambda\_pool\_log\_group) | n/a |
| <a name="output_lambda_scale_down"></a> [lambda\_scale\_down](#output\_lambda\_scale\_down) | n/a |
| <a name="output_lambda_scale_down_log_group"></a> [lambda\_scale\_down\_log\_group](#output\_lambda\_scale\_down\_log\_group) | n/a |
| <a name="output_lambda_scale_up"></a> [lambda\_scale\_up](#output\_lambda\_scale\_up) | n/a |
| <a name="output_lambda_scale_up_log_group"></a> [lambda\_scale\_up\_log\_group](#output\_lambda\_scale\_up\_log\_group) | n/a |
| <a name="output_provider"></a> [provider](#output\_provider) | Selected compute provider type and its provider-specific resources. |
| <a name="output_role_pool"></a> [role\_pool](#output\_role\_pool) | n/a |
| <a name="output_role_runner"></a> [role\_runner](#output\_role\_runner) | Runner IAM role created by the common stack. Empty when an external runner role is used. |
| <a name="output_role_scale_down"></a> [role\_scale\_down](#output\_role\_scale\_down) | n/a |
| <a name="output_role_scale_up"></a> [role\_scale\_up](#output\_role\_scale\_up) | n/a |
<!-- END_TF_DOCS -->
