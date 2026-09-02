# Ephemeral Amazon Linux xX64

This example is based on the default setup, but shows how runners can be used with the ephemeral flag enabled. Once enabled, ephemeral runners will be used for one job only. Each job requires a fresh instance. This feature should be used in combination with the `workflow_job` event. See GitHub webhook endpoint configuration(link needed here). It is also suggested to use a pre-build AMI to minimize runner launch times.
## Usages

Steps for the full setup, such as creating a GitHub app can be found the [docs](https://github-aws-runners.github.io/terraform-aws-github-runner/getting-started/). First download the Lambda releases from GitHub. Alternatively you can build the lambdas locally with Node or Docker, there is a simple build script in `<root>/.ci/build.sh`. In the `main.tf` you can simply remove the location of the lambda zip files, the default location will work in this case.

> Ensure you have set the version in `lambdas-download/main.tf` for running the example. The version needs to be set to a GitHub release version, see https://github.com/github-aws-runners/terraform-aws-github-runner/releases

```bash
cd lambdas-download
terraform init
terraform apply
cd ..
```

Before running Terraform, ensure the GitHub app is configured. See the [configuration details](https://github-aws-runners.github.io/terraform-aws-github-runner/configuration/#ephemeral-runners) for more details.

```bash
terraform init
terraform apply
```

The module will try to update the GitHub App webhook and secret (only linux/mac). You can receive the webhook details by running:

```bash
terraform output webhook_secret
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
| <a name="provider_random"></a> [random](#provider\_random) | 3.8.1 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_base"></a> [base](#module\_base) | ../base | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ../../ | n/a |
| <a name="module_webhook_github_app"></a> [webhook\_github\_app](#module\_webhook\_github\_app) | ../../modules/webhook-github-app | n/a |

## Resources

| Name | Type |
|------|------|
| [random_id.random](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/id) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_aws_access_key"></a> [aws\_access\_key](#input\_aws\_access\_key) | Optional AWS access key for the provider. | `string` | `null` | no |
| <a name="input_ami"></a> [ami](#input\_ami) | AMI lookup configuration passed to the runner module. | <pre>object({<br/>    filter = optional(map(list(string)), {<br/>      state = ["available"]<br/>    })<br/>    owners               = optional(list(string), ["amazon"])<br/>    id_ssm_parameter_arn = optional(string, null)<br/>    kms_key_arn          = optional(string, null)<br/>  })</pre> | `null` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region. | `string` | `"eu-west-1"` | no |
| <a name="input_aws_secret_key"></a> [aws\_secret\_key](#input\_aws\_secret\_key) | Optional AWS secret key for the provider. | `string` | `null` | no |
| <a name="input_enable_webhook_github_app"></a> [enable\_webhook\_github\_app](#input\_enable_webhook\_github\_app) | Whether to configure the GitHub App webhook with GitHub. | `bool` | `true` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | Environment name, used as prefix | `string` | `null` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub for API usages. | <pre>object({<br/>    id         = string<br/>    key_base64 = string<br/>  })</pre> | n/a | yes |
| <a name="input_runner_binaries_syncer_lambda_zip"></a> [runner\_binaries\_syncer\_lambda\_zip](#input\_runner\_binaries\_syncer\_lambda\_zip) | File location of the runner binaries syncer Lambda zip file. | `string` | `null` | no |
| <a name="input_runners_lambda_zip"></a> [runners\_lambda\_zip](#input\_runners\_lambda\_zip) | File location of the runners Lambda zip file. | `string` | `null` | no |
| <a name="input_s3_use_path_style"></a> [s3\_use\_path\_style](#input\_s3\_use\_path\_style) | Use path-style S3 requests. | `bool` | `false` | no |
| <a name="input_skip_credentials_validation"></a> [skip\_credentials\_validation](#input\_skip\_credentials\_validation) | Skip AWS credential validation. | `bool` | `false` | no |
| <a name="input_skip_metadata_api_check"></a> [skip\_metadata\_api\_check](#input\_skip\_metadata\_api\_check) | Skip the EC2 metadata API check. | `bool` | `false` | no |
| <a name="input_skip_region_validation"></a> [skip\_region\_validation](#input\_skip\_region\_validation) | Skip AWS region validation. | `bool` | `false` | no |
| <a name="input_skip_requesting_account_id"></a> [skip\_requesting\_account\_id](#input\_skip\_requesting\_account\_id) | Skip requesting the AWS account ID. | `bool` | `false` | no |
| <a name="input_webhook_lambda_zip"></a> [webhook\_lambda\_zip](#input\_webhook\_lambda\_zip) | File location of the webhook Lambda zip file. | `string` | `null` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_runners"></a> [runners](#output\_runners) | n/a |
| <a name="output_webhook_endpoint"></a> [webhook\_endpoint](#output\_webhook\_endpoint) | n/a |
| <a name="output_webhook_secret"></a> [webhook\_secret](#output\_webhook\_secret) | n/a |
<!-- END_TF_DOCS -->
