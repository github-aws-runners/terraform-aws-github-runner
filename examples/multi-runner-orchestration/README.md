# Multi-runner orchestration example

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.5.6 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |
| <a name="requirement_null"></a> [null](#requirement\_null) | ~> 3.0 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | 6.66.0 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_base"></a> [base](#module\_base) | ../base | n/a |
| <a name="module_microvm_foundation"></a> [microvm\_foundation](#module\_microvm\_foundation) | ../../modules/microvm-foundation | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ../../modules/multi-runner | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_cloudwatch_log_group.aws_cloudwatch_log_group_microvm](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_ecr_repository.base_ubuntu24](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecr_repository) | resource |
| [aws_ecr_repository_policy.repository_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecr_repository_policy) | resource |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_iam_policy_document.ecr_repository_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS Region where the runner control plane and compute provider resources are deployed. | `string` | `"eu-west-1"` | no |
| <a name="input_compute_provider"></a> [compute\_provider](#input\_compute\_provider) | Provider-specific settings for the EC2 and MicroVM runner lanes. | <pre>object({<br/>    aws = object({<br/>      ec2 = object({<br/>        instance_types = list(string)<br/>        ami = object({<br/>          filter = optional(map(list(string)), { state = ["available"] })<br/>          owners = optional(list(string), ["amazon"])<br/>          id_ssm_parameter = optional(object({<br/>            arn = string<br/>          }), null)<br/>          kms_key = optional(object({<br/>            arn = string<br/>          }), null)<br/>        })<br/>      })<br/>      microvm = object({<br/>        image_arn                  = string<br/>        image_version              = optional(string, null)<br/>        ingress_network_connectors = optional(list(string), [])<br/>        egress_network_connectors  = list(string)<br/>      })<br/>    })<br/>  })</pre> | n/a | yes |
| <a name="input_environment"></a> [environment](#input\_environment) | Name prefix for the example resources. | `string` | n/a | yes |
| <a name="input_github"></a> [github](#input\_github) | Optional GitHub endpoint and scale-set ownership settings. | <pre>object({<br/>    url                = optional(string, null)<br/>    ssl_verify         = optional(bool, true)<br/>    runner_owner       = optional(string, null)<br/>    registration_level = optional(string, "organization")<br/>  })</pre> | `{}` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub App ID, base64-encoded private key, and installation ID. | <pre>object({<br/>    id              = string<br/>    key_base64      = string<br/>    installation_id = optional(string, null)<br/>    webhook_secret  = string<br/>  })</pre> | n/a | yes |
| <a name="input_runners_lambda_zip"></a> [runners\_lambda\_zip](#input\_runners\_lambda\_zip) | Local ZIP file for the runner-control Lambda. | `string` | n/a | yes |
| <a name="input_scale_set"></a> [scale\_set](#input\_scale\_set) | GitHub Actions scale-set configuration. | <pre>object({<br/>    name              = string<br/>    runner_group_name = optional(string, "Default")<br/>    min_runners       = optional(number, 0)<br/>    container = optional(object({<br/>      image = optional(string, null)<br/>    }), {})<br/>  })</pre> | n/a | yes |
| <a name="input_webhook_lambda_zip"></a> [webhook\_lambda\_zip](#input\_webhook\_lambda\_zip) | Local ZIP file for the webhook Lambda. | `string` | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_microvm"></a> [microvm](#output\_microvm) | n/a |
| <a name="output_webhook_endpoint"></a> [webhook\_endpoint](#output\_webhook\_endpoint) | n/a |
| <a name="output_webhook_secret"></a> [webhook\_secret](#output\_webhook\_secret) | n/a |
<!-- END_TF_DOCS -->
