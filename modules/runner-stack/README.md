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

The scale down lambda is triggered via a CloudWatch event. The event is triggered by a cron expression defined in `scale_down.schedule_expression` (https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html). For scaling down GitHub does not provide a good API yet, therefore we run the scaling down based on this event every x minutes. Each time the lambda is triggered it tries to remove all runners older than x minutes (configurable) managed in this deployment. In case the runner can be removed from GitHub, which means it is not executing a workflow, the lambda will terminate the EC2 instance.

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
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | AWS partition used to construct ARNs. | `string` | `"aws"` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region. | `string` | n/a | yes |
| <a name="input_compute_provider"></a> [compute\_provider](#input\_compute\_provider) | Typed compute-provider configuration. Provider-owned settings must remain inside the selected provider block. | <pre>object({<br/>    type = string<br/><br/>    ec2 = optional(object({<br/>      ami = optional(object({<br/>        filter               = optional(map(list(string)), { state = ["available"] })<br/>        owners               = optional(list(string), ["amazon"])<br/>        id_ssm_parameter_arn = optional(string, null)<br/>        kms_key_arn          = optional(string, null)<br/>      }), null)<br/>      vpc_id     = string<br/>      subnet_ids = list(string)<br/>      overrides = optional(object({<br/>        name_runner = optional(string, "")<br/>        name_sg     = optional(string, "")<br/>      }), {})<br/>      instance_profile = optional(object({<br/>        name = string<br/>      }), null)<br/>      instance_profile_path = optional(string, null)<br/>      binaries_syncer = optional(object({<br/>        enabled = optional(bool, true)<br/>        s3 = optional(object({<br/>          arn = string<br/>          id  = string<br/>          key = string<br/>        }), null)<br/>      }), {})<br/>      block_device_mappings = optional(list(object({<br/>        delete_on_termination      = optional(bool, true)<br/>        device_name                = optional(string, "/dev/xvda")<br/>        encrypted                  = optional(bool, true)<br/>        iops                       = optional(number)<br/>        kms_key_id                 = optional(string)<br/>        snapshot_id                = optional(string)<br/>        throughput                 = optional(number)<br/>        volume_initialization_rate = optional(number)<br/>        volume_size                = number<br/>        volume_type                = optional(string, "gp3")<br/>      })), [{ volume_size = 30 }])<br/>      ebs_optimized                 = optional(bool, false)<br/>      instance_target_capacity_type = optional(string, "spot")<br/>      instance_allocation_strategy  = optional(string, "lowest-price")<br/>      instance_type_priorities      = optional(map(number), null)<br/>      instance_max_spot_price       = optional(string, null)<br/>      instance_types                = list(string)<br/>      user_data = optional(object({<br/>        enabled               = optional(bool, true)<br/>        template              = optional(string, null)<br/>        content               = optional(string, null)<br/>        pre_install           = optional(string, "")<br/>        post_install          = optional(string, "")<br/>        debug_logging_enabled = optional(bool, false)<br/>      }), {})<br/>      ssm_enabled                     = optional(bool, false)<br/>      create_service_linked_role_spot = optional(bool, false)<br/>      cloudwatch_agent = optional(object({<br/>        enabled = optional(bool, true)<br/>        config  = optional(string, null)<br/>      }), {})<br/>      managed_security_group_enabled = optional(bool, true)<br/>      log_files = optional(list(object({<br/>        log_group_name   = string<br/>        prefix_log_group = bool<br/>        file_path        = string<br/>        log_stream_name  = string<br/>        log_class        = optional(string, "STANDARD")<br/>      })), null)<br/>      key_name                      = optional(string, null)<br/>      additional_security_group_ids = optional(list(string), [])<br/>      detailed_monitoring_enabled   = optional(bool, false)<br/>      egress_rules = optional(list(object({<br/>        cidr_blocks      = list(string)<br/>        ipv6_cidr_blocks = list(string)<br/>        prefix_list_ids  = list(string)<br/>        from_port        = number<br/>        protocol         = string<br/>        security_groups  = list(string)<br/>        self             = bool<br/>        to_port          = number<br/>        description      = string<br/>        })), [{<br/>        cidr_blocks      = ["0.0.0.0/0"]<br/>        ipv6_cidr_blocks = ["::/0"]<br/>        prefix_list_ids  = null<br/>        from_port        = 0<br/>        protocol         = "-1"<br/>        security_groups  = null<br/>        self             = null<br/>        to_port          = 0<br/>        description      = null<br/>      }])<br/>      tags = optional(map(string), {})<br/>      metadata_options = optional(object({<br/>        instance_metadata_tags      = optional(string, "enabled")<br/>        http_endpoint               = optional(string, "enabled")<br/>        http_tokens                 = optional(string, "required")<br/>        http_put_response_hop_limit = optional(number, 1)<br/>      }), {})<br/>      credit_specification = optional(string, null)<br/>      cpu_options = optional(object({<br/>        core_count            = optional(number)<br/>        threads_per_core      = optional(number)<br/>        amd_sev_snp           = optional(string)<br/>        nested_virtualization = optional(string)<br/>      }), null)<br/>      placement = optional(object({<br/>        affinity                = optional(string)<br/>        availability_zone       = optional(string)<br/>        group_id                = optional(string)<br/>        group_name              = optional(string)<br/>        host_id                 = optional(string)<br/>        host_resource_group_arn = optional(string)<br/>        spread_domain           = optional(string)<br/>        tenancy                 = optional(string)<br/>        partition_number        = optional(number)<br/>      }), null)<br/>      license_specifications = optional(list(object({<br/>        license_configuration_arn = string<br/>      })), [])<br/>      associate_public_ipv4_address        = optional(bool, false)<br/>      enable_on_demand_failover_for_errors = optional(list(string), [])<br/>      scale_errors = optional(list(string), [<br/>        "UnfulfillableCapacity",<br/>        "MaxSpotInstanceCountExceeded",<br/>        "TargetCapacityLimitExceededException",<br/>        "RequestLimitExceeded",<br/>        "ResourceLimitExceeded",<br/>        "MaxSpotInstanceCountExceeded",<br/>        "MaxSpotFleetRequestCountExceeded",<br/>        "InsufficientInstanceCapacity",<br/>        "InsufficientCapacityOnHost",<br/>      ])<br/>      use_dedicated_host = optional(bool, false)<br/>    }), null)<br/>  })</pre> | n/a | yes |
| <a name="input_github"></a> [github](#input\_github) | GitHub API and registration configuration. | <pre>object({<br/>    app_parameters = object({<br/>      key_base64 = map(string)<br/>      id         = map(string)<br/>    })<br/>    organization_runners = bool<br/>    enterprise_server = optional(object({<br/>      url        = optional(string, null)<br/>      ssl_verify = optional(bool, true)<br/>    }), {})<br/>    user_agent = optional(string, null)<br/>  })</pre> | n/a | yes |
| <a name="input_job_retry"></a> [job\_retry](#input\_job\_retry) | Job-retry queue and Lambda configuration. | <pre>object({<br/>    enabled          = optional(bool, false)<br/>    delay_in_seconds = optional(number, 300)<br/>    delay_backoff    = optional(number, 2)<br/>    max_attempts     = optional(number, 1)<br/>    lambda = optional(object({<br/>      memory_size                    = optional(number, 256)<br/>      reserved_concurrent_executions = optional(number, 1)<br/>      timeout                        = optional(number, 30)<br/>    }), {})<br/>  })</pre> | `{}` | no |
| <a name="input_lambda"></a> [lambda](#input\_lambda) | Configuration shared by the control-plane Lambda functions. | <pre>object({<br/>    zip = optional(string, null)<br/>    s3 = optional(object({<br/>      bucket         = optional(string, null)<br/>      key            = optional(string, null)<br/>      object_version = optional(string, null)<br/>    }), {})<br/>    runtime            = optional(string, "nodejs24.x")<br/>    architecture       = optional(string, "arm64")<br/>    subnet_ids         = optional(list(string), [])<br/>    security_group_ids = optional(list(string), [])<br/>    tags               = optional(map(string), {})<br/>    role = optional(object({<br/>      path                 = optional(string, null)<br/>      permissions_boundary = optional(string, null)<br/>    }), {})<br/>  })</pre> | `{}` | no |
| <a name="input_observability"></a> [observability](#input\_observability) | Logging, tracing, and metrics configuration. | <pre>object({<br/>    log_level = optional(string, "info")<br/>    logs = optional(object({<br/>      retention_in_days = optional(number, 180)<br/>      kms_key_id        = optional(string, null)<br/>      class             = optional(string, "STANDARD")<br/>    }), {})<br/>    tracing = optional(object({<br/>      mode                  = optional(string, null)<br/>      capture_http_requests = optional(bool, false)<br/>      capture_error         = optional(bool, false)<br/>    }), {})<br/>    metrics = optional(object({<br/>      enable    = optional(bool, false)<br/>      namespace = optional(string, "GitHub Runners")<br/>      metric = optional(object({<br/>        enable_github_app_rate_limit    = optional(bool, true)<br/>        enable_job_retry                = optional(bool, true)<br/>        enable_spot_termination_warning = optional(bool, true)<br/>      }), {})<br/>    }), {})<br/>  })</pre> | `{}` | no |
| <a name="input_pool"></a> [pool](#input\_pool) | Scheduled runner-pool configuration. | <pre>object({<br/>    config = optional(list(object({<br/>      schedule_expression          = string<br/>      schedule_expression_timezone = optional(string)<br/>      size                         = number<br/>    })), [])<br/>    include_busy_runners = optional(bool, false)<br/>    runner_owner         = optional(string, null)<br/>    lambda = optional(object({<br/>      memory_size                    = optional(number, 512)<br/>      timeout                        = optional(number, 60)<br/>      reserved_concurrent_executions = optional(number, 1)<br/>    }), {})<br/>  })</pre> | `{}` | no |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | The prefix used for naming resources. | `string` | `"github-actions"` | no |
| <a name="input_queue"></a> [queue](#input\_queue) | Build queue and Lambda event-source configuration. | <pre>object({<br/>    build = object({<br/>      arn = string<br/>      url = string<br/>    })<br/>    event_source_mapping = optional(object({<br/>      batch_size                         = optional(number, 10)<br/>      maximum_batching_window_in_seconds = optional(number, 0)<br/>    }), {})<br/>  })</pre> | n/a | yes |
| <a name="input_runner"></a> [runner](#input\_runner) | Provider-neutral GitHub runner configuration. | <pre>object({<br/>    os                     = optional(string, "linux")<br/>    architecture           = optional(string, "x64")<br/>    boot_time_in_minutes   = optional(number, 5)<br/>    disable_default_labels = optional(bool, false)<br/>    labels                 = list(string)<br/>    group_name             = optional(string, "Default")<br/>    name_prefix            = optional(string, "")<br/>    run_as_root            = optional(bool, false)<br/>    run_as                 = optional(string, "ec2-user")<br/>    maximum_count          = optional(number, 3)<br/>    ephemeral              = optional(bool, false)<br/>    jit_config_enabled     = optional(bool, null)<br/>    auto_update_disabled   = optional(bool, false)<br/>    hooks = optional(object({<br/>      job_started   = optional(string, "")<br/>      job_completed = optional(string, "")<br/>    }), {})<br/>    iam = optional(object({<br/>      role = optional(object({<br/>        arn = string<br/>      }), null)<br/>      managed_policy_arns  = optional(map(string), {})<br/>      path                 = optional(string, null)<br/>      permissions_boundary = optional(string, null)<br/>    }), {})<br/>  })</pre> | n/a | yes |
| <a name="input_scale_down"></a> [scale\_down](#input\_scale\_down) | Scale-down Lambda and idle-runner configuration. | <pre>object({<br/>    memory_size                     = optional(number, 512)<br/>    timeout                         = optional(number, 60)<br/>    schedule_expression             = optional(string, "cron(*/5 * * * ? *)")<br/>    minimum_running_time_in_minutes = optional(number, null)<br/>    idle_config = optional(list(object({<br/>      cron             = string<br/>      timeZone         = string<br/>      idleCount        = number<br/>      evictionStrategy = optional(string, "oldest_first")<br/>    })), [])<br/>  })</pre> | `{}` | no |
| <a name="input_scale_up"></a> [scale\_up](#input\_scale\_up) | Scale-up Lambda configuration. | <pre>object({<br/>    memory_size                    = optional(number, 512)<br/>    timeout                        = optional(number, 60)<br/>    reserved_concurrent_executions = optional(number, 1)<br/>    job_queued_check_enabled       = optional(bool, null)<br/>  })</pre> | `{}` | no |
| <a name="input_ssm"></a> [ssm](#input\_ssm) | Parameter Store paths, encryption, tags, and housekeeper configuration. | <pre>object({<br/>    paths = object({<br/>      root   = string<br/>      tokens = string<br/>      config = string<br/>    })<br/>    kms_key_arn    = optional(string, null)<br/>    parameter_tags = optional(map(string), {})<br/>    housekeeper = optional(object({<br/>      schedule_expression = optional(string, "rate(1 day)")<br/>      state               = optional(string, "ENABLED")<br/>      lambda = optional(object({<br/>        memory_size = optional(number, 512)<br/>        timeout     = optional(number, 60)<br/>      }), {})<br/>      config = optional(object({<br/>        tokenPath      = optional(string)<br/>        minimumDaysOld = optional(number, 1)<br/>        dryRun         = optional(bool, false)<br/>      }), {})<br/>    }), {})<br/>  })</pre> | n/a | yes |
| <a name="input_tags"></a> [tags](#input\_tags) | Map of tags added to created resources. | `map(string)` | `{}` | no |

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
