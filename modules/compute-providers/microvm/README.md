<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.5 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.0 |
| <a name="provider_terraform"></a> [terraform](#provider\_terraform) | n/a |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [terraform_data.validate_config](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/resources/data) | resource |
| [aws_iam_policy_document.assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.scale_up](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | AWS partition used to construct IAM ARNs. | `string` | `"aws"` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region used by the MicroVM runtime provider. | `string` | n/a | yes |
| <a name="input_config"></a> [config](#input\_config) | Lambda MicroVM compute-provider configuration. Paths match `compute_provider.microvm` in the runner stack.<br/><br/>- `image_identifier`: ARN or ID of the MicroVM image used to run GitHub runners.<br/>- `image_version`: Optional MicroVM image version.<br/>- `execution_role`: Optional externally managed execution role assumed by MicroVMs. Null uses the common runner role.<br/>- `execution_role.arn`: ARN of the externally managed MicroVM execution role.<br/>- `runner_role_trust_services`: Service principals trusted by the common runner role when it is used as the MicroVM execution role.<br/>- `egress_network_connectors`: Egress network connectors passed to RunMicrovm.<br/>- `idle_policy`: Optional auto-suspend and auto-resume configuration passed to RunMicrovm.<br/>- `idle_policy.max_idle_duration_seconds`: Maximum idle time before MicroVM auto-suspend.<br/>- `idle_policy.suspended_duration_seconds`: Maximum suspended time before MicroVM termination.<br/>- `idle_policy.auto_resume_enabled`: Enables automatic resume on inbound traffic while suspended.<br/>- `logging`: Optional RunMicrovm logging union. Exactly one of `cloud_watch` or `disabled` must be selected when set.<br/>- `logging.cloud_watch.log_group`: Optional CloudWatch Logs log group used by MicroVM runtime logs.<br/>- `logging.cloud_watch.log_stream`: Optional CloudWatch Logs log stream used by MicroVM runtime logs.<br/>- `logging.disabled`: Disables MicroVM runtime logging when true.<br/>- `run_hook_payload`: Optional payload delivered to the MicroVM `/run` hook. Maximum 16,384 characters.<br/>- `maximum_duration_in_seconds`: Optional maximum MicroVM lifetime. Valid range is 1 through 28,800 seconds.<br/>- `environment_variables`: Additional provider-specific Lambda environment variables merged into scale-up, scale-down, and pool.<br/>- `tags`: Tags encoded into the MicroVM runner configuration.<br/>- `iam.resource_arns`: Resource ARNs used by the generated MicroVM control-plane policies. The service is new and some actions may require `*`.<br/>- `iam.actions.scale_up`: MicroVM IAM actions used by scale-up and pool.<br/>- `iam.actions.scale_down`: MicroVM IAM actions used by scale-down.<br/>- `iam.additional_policy_json.scale_up`: Optional additional provider policy attached separately to the scale-up Lambda role.<br/>- `iam.managed_policy_arns.scale_up`: Optional managed policy attached to the scale-up Lambda role.<br/>- `iam.managed_policy_arns.pool`: Optional managed policy attached to the pool Lambda role. | <pre>object({<br/>    image_identifier = string<br/>    image_version    = optional(string, null)<br/>    execution_role = optional(object({<br/>      arn = string<br/>    }), null)<br/>    runner_role_trust_services = optional(list(string), ["lambda.amazonaws.com"])<br/>    egress_network_connectors  = optional(list(string), [])<br/>    idle_policy = optional(object({<br/>      max_idle_duration_seconds  = number<br/>      suspended_duration_seconds = number<br/>      auto_resume_enabled        = bool<br/>    }), null)<br/>    logging = optional(object({<br/>      cloud_watch = optional(object({<br/>        log_group  = optional(string, null)<br/>        log_stream = optional(string, null)<br/>      }), null)<br/>      disabled = optional(bool, false)<br/>    }), null)<br/>    run_hook_payload            = optional(string, null)<br/>    maximum_duration_in_seconds = optional(number, null)<br/>    environment_variables       = optional(map(string), {})<br/>    tags                        = optional(map(string), {})<br/>    iam = optional(object({<br/>      resource_arns = optional(list(string), ["*"])<br/>      actions = optional(object({<br/>        scale_up   = optional(list(string), null)<br/>        scale_down = optional(list(string), null)<br/>      }), {})<br/>      additional_policy_json = optional(object({<br/>        scale_up = optional(string, null)<br/>      }), {})<br/>      managed_policy_arns = optional(object({<br/>        scale_up = optional(string, null)<br/>        pool     = optional(string, null)<br/>      }), {})<br/>    }), {})<br/>  })</pre> | n/a | yes |
| <a name="input_github"></a> [github](#input\_github) | GitHub settings reserved for future MicroVM bootstrap integration. | `any` | `{}` | no |
| <a name="input_observability"></a> [observability](#input\_observability) | Observability settings reserved for future MicroVM bootstrap integration. | `any` | `{}` | no |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | Prefix used to identify MicroVM runners created for this runner stack. | `string` | `"github-actions"` | no |
| <a name="input_runner"></a> [runner](#input\_runner) | Provider-neutral runner settings consumed by MicroVM.<br/><br/>- `boot_time_in_minutes`: Expected boot and registration duration used by scale-down and pool.<br/>- `name_prefix`: Prefix added to registered runner names.<br/>- `iam.role.arn`: Resolved common runner role ARN used as the default MicroVM execution role. | <pre>object({<br/>    boot_time_in_minutes = optional(number, 5)<br/>    name_prefix          = optional(string, "")<br/>    iam = object({<br/>      role = object({<br/>        arn  = string<br/>        name = string<br/>      })<br/>    })<br/>  })</pre> | n/a | yes |
| <a name="input_ssm"></a> [ssm](#input\_ssm) | SSM settings reserved for future MicroVM bootstrap integration. | `any` | `{}` | no |
| <a name="input_tags"></a> [tags](#input\_tags) | Base tags encoded into the MicroVM runner configuration. Nested MicroVM tags override this map. | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_assume_role_policy"></a> [assume\_role\_policy](#output\_assume\_role\_policy) | Lambda MicroVM runner-role trust policy. |
| <a name="output_environment_variables"></a> [environment\_variables](#output\_environment\_variables) | Provider-specific Lambda environment variable fragments consumed by runner-stack. |
| <a name="output_policies"></a> [policies](#output\_policies) | Provider-specific IAM policy fragments consumed by runner-stack. |
| <a name="output_provider"></a> [provider](#output\_provider) | Nested Lambda MicroVM compute-provider contract consumed by runner-stack. |
| <a name="output_resources"></a> [resources](#output\_resources) | Provider-specific MicroVM resources exposed by runner-stack. |
<!-- END_TF_DOCS -->
