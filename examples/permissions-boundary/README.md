# Action runners deployed with permissions boundary

This module shows how to create GitHub action runners with permissions boundaries and paths used in role, policies, and instance profiles.

## Usages

```bash
cd setup
terraform init
terraform apply
cd ..
```

Now a new role and policies should be created. The output of the previous step is imported in this workspace to load the role and policy. The deployment of the runner module assumes the new role before creating all resources (https://www.terraform.io/docs/providers/aws/index.html#assume-role). Before running Terraform, ensure the GitHub app is configured.

Download the lambda releases.

```bash
cd ../lambdas-download
terraform init
terraform apply -var=module_version=<VERSION>
cd -
```

Now you can deploy the module.

```bash
terraform init
terraform apply
```

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |
| <a name="requirement_local"></a> [local](#requirement\_local) | ~> 2.0 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | 6.35.1 |
| <a name="provider_random"></a> [random](#provider\_random) | 3.9.0 |
| <a name="provider_terraform"></a> [terraform](#provider\_terraform) | n/a |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_base"></a> [base](#module\_base) | ../base | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ../../ | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_kms_alias.github](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_alias) | resource |
| [aws_kms_key.github](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key) | resource |
| [random_id.random](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/id) | resource |
| [terraform_remote_state.iam](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/data-sources/remote_state) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_ami"></a> [ami](#input\_ami) | AMI configuration for the action runner instances. Uses the module default when unset. | <pre>object({<br/>    filter               = optional(map(list(string)), { state = ["available"] })<br/>    owners               = optional(list(string), ["amazon"])<br/>    id_ssm_parameter_arn = optional(string, null)<br/>    kms_key_arn          = optional(string, null)<br/>  })</pre> | `null` | no |
| <a name="input_aws_s3_use_path_style"></a> [aws\_s3\_use\_path\_style](#input\_aws\_s3\_use\_path\_style) | Whether the AWS provider should use path-style S3 addressing. | `bool` | `false` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub for API usages. | <pre>object({<br/>    id         = string<br/>    key_base64 = string<br/>  })</pre> | n/a | yes |
| <a name="input_iam_state_path"></a> [iam\_state\_path](#input\_iam\_state\_path) | Path to the state produced by the permissions-boundary setup. Uses the example setup state when unset. | `string` | `null` | no |
| <a name="input_runner_binaries_syncer_lambda_zip"></a> [runner\_binaries\_syncer\_lambda\_zip](#input\_runner\_binaries\_syncer\_lambda\_zip) | Path to the runner binaries syncer Lambda archive. | `string` | `"../lambdas-download/runner-binaries-syncer.zip"` | no |
| <a name="input_runners_lambda_zip"></a> [runners\_lambda\_zip](#input\_runners\_lambda\_zip) | Path to the runners Lambda archive. | `string` | `"../lambdas-download/runners.zip"` | no |
| <a name="input_webhook_lambda_zip"></a> [webhook\_lambda\_zip](#input\_webhook\_lambda\_zip) | Path to the webhook Lambda archive. | `string` | `"../lambdas-download/webhook.zip"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_runners"></a> [runners](#output\_runners) | n/a |
| <a name="output_webhook"></a> [webhook](#output\_webhook) | n/a |
<!-- END_TF_DOCS -->
