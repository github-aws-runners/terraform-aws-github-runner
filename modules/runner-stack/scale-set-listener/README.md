# Scale-set listener

Deploys a singleton ECS/Fargate service that owns a GitHub Actions runner scale-set message session
and reconciles assigned jobs with a provider-neutral compute contract. This module is an internal
component of `modules/runner-stack`.

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

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_cloudwatch_log_group.listener](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_metric_alarm.listener_missing](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_ecs_cluster.listener](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_cluster) | resource |
| [aws_ecs_service.listener](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_service) | resource |
| [aws_ecs_task_definition.listener](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_task_definition) | resource |
| [aws_iam_role.execution](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.task](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.task_common](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.task_runner_provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.execution](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_security_group.listener](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group) | resource |
| [aws_vpc_security_group_egress_rule.https_ipv4](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_security_group_egress_rule) | resource |
| [aws_vpc_security_group_egress_rule.https_ipv6](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_security_group_egress_rule) | resource |
| [aws_iam_policy_document.task_assume](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.task_common](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_config"></a> [config](#input\_config) | Provider-neutral configuration for one continuously running GitHub Actions<br/>runner scale-set listener. GitHub App credentials remain in SSM Parameter<br/>Store; only parameter names are exposed to the container. | <pre>object({<br/>    prefix        = string<br/>    aws_region    = string<br/>    aws_partition = optional(string, "aws")<br/>    tags          = optional(map(string), {})<br/>    log_level     = optional(string, "info")<br/><br/>    github = object({<br/>      config_url  = string<br/>      ghes_url    = optional(string, null)<br/>      force_ghes  = optional(bool, false)<br/>      ssl_verify  = optional(bool, true)<br/>      user_agent  = optional(string, null)<br/>      kms_key_arn = optional(string, null)<br/>      app_parameters = object({<br/>        id              = list(object({ name = string, arn = string }))<br/>        key_base64      = list(object({ name = string, arn = string }))<br/>        installation_id = list(object({ name = string, arn = string }))<br/>      })<br/>    })<br/><br/>    scale_set = object({<br/>      id               = number<br/>      min_runners      = optional(number, 0)<br/>      max_runners      = number<br/>      github_app_index = optional(number, 0)<br/>      session_owner    = optional(string, null)<br/>      work_folder      = optional(string, "_work")<br/>    })<br/><br/>    runner = object({<br/>      name_prefix = optional(string, "")<br/>    })<br/><br/>    ssm = object({<br/>      token_path           = string<br/>      token_path_arn       = string<br/>      parameter_store_tags = optional(map(string), {})<br/>    })<br/><br/>    ecs = object({<br/>      container_image         = string<br/>      vpc_id                  = string<br/>      subnet_ids              = list(string)<br/>      security_group_ids      = optional(list(string), [])<br/>      create_security_group   = optional(bool, true)<br/>      egress_ipv4_cidr_blocks = optional(list(string), ["0.0.0.0/0"])<br/>      egress_ipv6_cidr_blocks = optional(list(string), [])<br/>      assign_public_ip        = optional(bool, false)<br/>      cluster = optional(object({<br/>        arn = string<br/>      }), null)<br/>      cpu                       = optional(number, 256)<br/>      memory                    = optional(number, 512)<br/>      architecture              = optional(string, "x86_64")<br/>      platform_version          = optional(string, "LATEST")<br/>      health_check_interval     = optional(number, 30)<br/>      health_check_timeout      = optional(number, 5)<br/>      health_check_retries      = optional(number, 3)<br/>      health_check_start_period = optional(number, 30)<br/>    })<br/><br/>    logging = optional(object({<br/>      retention_in_days = optional(number, 180)<br/>      kms_key_id        = optional(string, null)<br/>      log_class         = optional(string, "STANDARD")<br/>    }), {})<br/><br/>    iam = optional(object({<br/>      role_path            = optional(string, null)<br/>      permissions_boundary = optional(string, null)<br/>    }), {})<br/><br/>    alarm = optional(object({<br/>      enabled    = optional(bool, false)<br/>      actions    = optional(list(string), [])<br/>      ok_actions = optional(list(string), [])<br/>    }), {})<br/>  })</pre> | n/a | yes |
| <a name="input_runner_provider"></a> [runner\_provider](#input\_runner\_provider) | Compute-provider contract consumed by the scale-set listener. | <pre>object({<br/>    type                  = string<br/>    environment_variables = map(string)<br/>    iam_policy_json       = string<br/>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_cluster_arn"></a> [cluster\_arn](#output\_cluster\_arn) | ARN of the ECS cluster hosting the scale-set listener. |
| <a name="output_execution_role"></a> [execution\_role](#output\_execution\_role) | IAM role used by ECS to pull the image and publish container logs. |
| <a name="output_listener"></a> [listener](#output\_listener) | Aggregate ECS scale-set listener resources. |
| <a name="output_log_group"></a> [log\_group](#output\_log\_group) | CloudWatch Logs group receiving scale-set listener output. |
| <a name="output_security_group"></a> [security\_group](#output\_security\_group) | Module-created listener security group, or null when only external groups are used. |
| <a name="output_service"></a> [service](#output\_service) | ECS service that keeps exactly one scale-set listener task running. |
| <a name="output_task_definition"></a> [task\_definition](#output\_task\_definition) | ECS task definition for the scale-set listener container. |
| <a name="output_task_role"></a> [task\_role](#output\_task\_role) | IAM role assumed by the scale-set listener application. |
<!-- END_TF_DOCS -->
