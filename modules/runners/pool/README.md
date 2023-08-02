# Pool module

This module creates the AWS resources required to maintain a pool of runners. However terraform modules are always exposed and theoretically can be used anywhere. This module is seen as a strict inner module.

## Why a submodule for the pool

The pool is an opt-in feature. To be able to use the count on a module level to avoid counts per resources a module is created. All inputs of the module are already defined on a higher level. See the mapping of the variables in [`pool.tf`](../pool.tf)
<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 0.14.1 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.2 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | ~> 5.2 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_cloudwatch_event_rule.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_target.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) | resource |
| [aws_cloudwatch_log_group.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_iam_role.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.pool_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.pool_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.ami_id_ssm_parameter_read](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.pool_vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_lambda_function.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_permission.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_iam_policy_document.lambda_assume_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.lambda_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | (optional) partition for the arn if not 'aws' | `string` | `"aws"` | no |
| <a name="input_config"></a> [config](#input\_config) | n/a | <pre>object({<br>    lambda = object({<br>      log_level                      = string<br>      logging_retention_in_days      = number<br>      logging_kms_key_id             = string<br>      reserved_concurrent_executions = number<br>      s3_bucket                      = string<br>      s3_key                         = string<br>      s3_object_version              = string<br>      security_group_ids             = list(string)<br>      runtime                        = string<br>      architecture                   = string<br>      timeout                        = number<br>      zip                            = string<br>      subnet_ids                     = list(string)<br>    })<br>    tags = map(string)<br>    ghes = object({<br>      url        = string<br>      ssl_verify = string<br>    })<br>    github_app_parameters = object({<br>      key_base64 = map(string)<br>      id         = map(string)<br>    })<br>    subnet_ids = list(string)<br>    runner = object({<br>      disable_runner_autoupdate = bool<br>      ephemeral                 = bool<br>      enable_jit_config         = bool<br>      boot_time_in_minutes      = number<br>      labels                    = string<br>      launch_template = object({<br>        name = string<br>      })<br>      group_name  = string<br>      name_prefix = string<br>      pool_owner  = string<br>      role = object({<br>        arn = string<br>      })<br>    })<br>    instance_types                = list(string)<br>    instance_target_capacity_type = string<br>    instance_allocation_strategy  = string<br>    instance_max_spot_price       = string<br>    prefix                        = string<br>    pool = list(object({<br>      schedule_expression = string<br>      size                = number<br>    }))<br>    role_permissions_boundary            = string<br>    kms_key_arn                          = string<br>    ami_kms_key_arn                      = string<br>    role_path                            = string<br>    ssm_token_path                       = string<br>    ssm_config_path                      = string<br>    ami_id_ssm_parameter_name            = string<br>    ami_id_ssm_parameter_read_policy_arn = string<br>    arn_ssm_parameters_path_config       = string<br>  })</pre> | n/a | yes |
| <a name="input_lambda_tracing_mode"></a> [lambda\_tracing\_mode](#input\_lambda\_tracing\_mode) | Enable X-Ray tracing for the lambda functions. | `string` | `null` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_lambda"></a> [lambda](#output\_lambda) | n/a |
| <a name="output_lambda_log_group"></a> [lambda\_log\_group](#output\_lambda\_log\_group) | n/a |
| <a name="output_role_pool"></a> [role\_pool](#output\_role\_pool) | n/a |
<!-- END_TF_DOCS -->