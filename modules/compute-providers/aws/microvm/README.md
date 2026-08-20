# AWS Lambda MicroVM runner provider

This internal module implements the AWS Lambda MicroVM compute provider used by `runner-config`. It returns provider-specific Lambda environment variables, control-plane IAM policy fragments, selected image metadata, and its provider-managed runtime log group through the common provider contract; the parent owns the runner role, Lambda resources, queues, schedules, and Parameter Store lifecycle.

Select it with the `compute_provider.aws.microvm` leaf. The Terraform dispatch key is `aws_microvm`, while the runtime `COMPUTE_PROVIDER_TYPE` remains `microvm` for compatibility with the control-plane Lambda. MicroVM lanes require Linux on ARM64 and ephemeral webhook orchestration with just-in-time configuration enabled.

MicroVM runners use the provider's fixed 28,800-second (8-hour) lifetime; this is not a Terraform input.

The resolved provider-neutral `runner.iam.role` is passed to Lambda as the MicroVM execution role. The provider creates `/github-self-hosted-runners/<prefix>/microvm` with the common observability lifecycle and derives a control-plane-only metadata prefix at `<ssm.paths.root>/<ssm.paths.config>/microvm-metadata`. Scale-up, scale-down, and pool use that non-secret prefix for MicroVM ownership and lifecycle state; the runner role retains access only to its one-time JIT path plus runtime logging and self-termination. When the runner role is supplied externally, its Lambda trust, JIT parameter access, stream-write, and self-termination permissions remain caller-owned.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.4.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.33 |
| <a name="provider_terraform"></a> [terraform](#provider\_terraform) | n/a |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_cloudwatch_log_group.runtime](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [terraform_data.validate_config](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/resources/data) | resource |
| [terraform_data.validate_runner](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/resources/data) | resource |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_iam_policy_document.runner_runtime_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.runner_ssm_jit](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.runner_terminate_self](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.scale_up](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | AWS partition used to construct IAM ARNs. | `string` | `"aws"` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region used by compute-provider resources and policy documents. | `string` | n/a | yes |
| <a name="input_config"></a> [config](#input\_config) | Lambda MicroVM compute-provider configuration. Paths match `compute_provider.aws.microvm` in runner-config.<br/><br/>- `image_arn`: ARN of the MicroVM image used to run GitHub runners.<br/>- `image_version`: Optional MicroVM image version.<br/>- `ingress_network_connectors`: Up to 10 Lambda network-connector ARNs passed to RunMicrovm.<br/>- `egress_network_connectors`: Up to 10 Lambda network-connector ARNs passed to RunMicrovm.<br/>- `environment_variables`: Additional provider-specific Lambda environment variables merged into scale-up, scale-down, and pool.<br/>- `iam.resource_arns.images`: Optional MicroVM image ARN allowlist for RunMicrovm and TerminateMicrovm. Null restricts both actions to `image_arn`; set an explicit list when dynamic image overrides are enabled. Provider-required list and connector permissions remain separately scoped to `*`.<br/>- `iam.additional_policy_json.scale_up`: Optional additional provider policy attached separately to the scale-up Lambda role.<br/>- `iam.managed_policies.scale_up`: Optional managed-policy wrapper attached to the scale-up Lambda role. Wrapper presence controls resource creation during planning.<br/>- `iam.managed_policies.scale_up.arn`: ARN of the scale-up managed policy. The ARN may remain unknown until apply.<br/>- `iam.managed_policies.pool`: Optional managed-policy wrapper attached to the pool Lambda role. Wrapper presence controls resource creation during planning.<br/>- `iam.managed_policies.pool.arn`: ARN of the pool managed policy. The ARN may remain unknown until apply. | <pre>object({<br/>    image_arn                  = string<br/>    image_version              = optional(string, null)<br/>    ingress_network_connectors = optional(list(string), [])<br/>    egress_network_connectors  = optional(list(string), [])<br/>    environment_variables      = optional(map(string), {})<br/>    iam = optional(object({<br/>      resource_arns = optional(object({<br/>        images = optional(list(string), null)<br/>      }), {})<br/>      additional_policy_json = optional(object({<br/>        scale_up = optional(string, null)<br/>      }), {})<br/>      managed_policies = optional(object({<br/>        scale_up = optional(object({<br/>          arn = string<br/>        }), null)<br/>        pool = optional(object({<br/>          arn = string<br/>        }), null)<br/>      }), {})<br/>    }), {})<br/>  })</pre> | n/a | yes |
| <a name="input_github"></a> [github](#input\_github) | GitHub Enterprise Server settings available to compute-provider bootstrap data.<br/><br/>- `enterprise_server.url`: Optional GitHub Enterprise Server base URL. Null selects GitHub.com.<br/>- `enterprise_server.ssl_verify`: Enables TLS certificate verification for GitHub Enterprise Server. | <pre>object({<br/>    enterprise_server = optional(object({<br/>      url        = optional(string, null)<br/>      ssl_verify = optional(bool, true)<br/>    }), {})<br/>  })</pre> | `{}` | no |
| <a name="input_observability"></a> [observability](#input\_observability) | Provider-neutral observability settings applied to the provider-managed MicroVM runtime log group.<br/><br/>- `logs.retention_in_days`: CloudWatch Logs retention period.<br/>- `logs.kms_key_id`: Optional KMS key ID or ARN used to encrypt the log group.<br/>- `logs.class`: CloudWatch log-group class.<br/>- `logs.tags`: Tags merged after module-level tags on the log group. | <pre>object({<br/>    logs = optional(object({<br/>      retention_in_days = optional(number, 180)<br/>      kms_key_id        = optional(string, null)<br/>      class             = optional(string, "STANDARD")<br/>      tags              = optional(map(string), {})<br/>    }), {})<br/>  })</pre> | `{}` | no |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | Prefix used to identify resources created for the runner configuration. | `string` | `"github-actions"` | no |
| <a name="input_runner"></a> [runner](#input\_runner) | Resolved runner settings consumed by the Lambda MicroVM compute provider.<br/><br/>- `os`: Runner operating system. Lambda MicroVM requires `linux`.<br/>- `architecture`: Runner distribution architecture. Lambda MicroVM requires `arm64`.<br/>- `name_prefix`: Prefix added to registered runner names.<br/>- `run_as_root`: Runs the runner service as root.<br/>- `run_as`: Operating-system user used when `run_as_root` is false.<br/>- `hooks.job_started`: Script installed as the runner job-started hook.<br/>- `hooks.job_completed`: Script installed as the runner job-completed hook.<br/>- `iam.role.arn`: Resolved runner-role ARN used as the MicroVM execution role and referenced by provider policies.<br/>- `iam.role.name`: Resolved runner-role name used by provider resources.<br/>- `iam.role.managed`: Whether runner-config manages the resolved runner role. Callers own an external role and must grant it `ssm:GetParameter` and `ssm:DeleteParameter` on the lane token path, `logs:CreateLogStream` and `logs:PutLogEvents` on the provider-managed runtime log group, and `lambda:TerminateMicrovm` on the approved image ARN or image allowlist for self-termination.<br/>- `iam.managed_policy_arns`: Common managed-policy ARNs returned with the provider-specific runner policies for attachment by runner-config.<br/>- `iam.path`: IAM path available to provider-managed IAM resources. Null derives the path from `prefix`. | <pre>object({<br/>    os           = optional(string, "linux")<br/>    architecture = optional(string, "arm64")<br/>    name_prefix  = optional(string, "")<br/>    run_as_root  = optional(bool, false)<br/>    run_as       = optional(string, "ec2-user")<br/>    hooks = optional(object({<br/>      job_started   = optional(string, "")<br/>      job_completed = optional(string, "")<br/>    }), {})<br/>    iam = object({<br/>      role = object({<br/>        arn     = string<br/>        name    = string<br/>        managed = optional(bool, true)<br/>      })<br/>      managed_policy_arns = optional(map(string), {})<br/>      path                = optional(string, null)<br/>    })<br/>  })</pre> | n/a | yes |
| <a name="input_ssm"></a> [ssm](#input\_ssm) | Parameter Store paths and tag scopes available to compute-provider bootstrap resources.<br/><br/>- `paths.root`: Root Parameter Store path for the runner configuration.<br/>- `paths.tokens`: Path segment used for registration tokens and just-in-time configuration.<br/>- `paths.config`: Path segment used for persistent runner and provider configuration. MicroVM control-plane metadata is stored under its `microvm-metadata` child prefix.<br/>- `tags`: Shared SSM tags that override module-level `tags`.<br/>- `parameters.tags`: Parameter-specific tags that override module-level and shared SSM tags. | <pre>object({<br/>    paths = object({<br/>      root   = string<br/>      tokens = string<br/>      config = string<br/>    })<br/>    tags = optional(map(string), {})<br/>    parameters = optional(object({<br/>      tags = optional(map(string), {})<br/>    }), {})<br/>  })</pre> | n/a | yes |
| <a name="input_tags"></a> [tags](#input\_tags) | Base tags available to taggable compute-provider resources. Provider-specific tags override this map within their documented scopes. | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_environment_variables"></a> [environment\_variables](#output\_environment\_variables) | Provider-specific Lambda environment variable fragments consumed by runner-config. |
| <a name="output_policies"></a> [policies](#output\_policies) | Provider-specific IAM policy fragments consumed by runner-config. |
| <a name="output_provider"></a> [provider](#output\_provider) | Nested Lambda MicroVM compute-provider contract consumed by runner-config. |
| <a name="output_resources"></a> [resources](#output\_resources) | Provider-specific MicroVM resources exposed by runner-config. |
<!-- END_TF_DOCS -->
