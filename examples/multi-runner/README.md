# Action runners deployment of Multiple-Runner-Configurations-Together example

This module shows how to create GitHub action runners with multiple runner configuration together in one deployment. This example has the configurations for the following runner types with the relevant labels supported by them as matchers:

- Linux ARM64 `["self-hosted", "linux", "arm64", "amazon"]`: Amazon Linux ARM64 non ephemeral runner based on module defaults
- Linux Ubuntu 24.04 `["self-hosted", "linux", "x64", "ubuntu-latest"]` or `["self-hosted", "linux", "x64", "ubuntu-2404"]`: Ubuntu runners non ephemeral based on a custom start script.
- Linux Ubuntu 22.04 `["self-hosted", "linux", "x64", "ubuntu-2204"]`: Ubuntu runners non ephemeral based on a custom start script.
- Linux X64 `["self-hosted", "linux", "x64", "amazon"]`: Amazon X64 Linux runners ephemeral with retry enabled.
- Windows X64 `["self-hosted", "windows", "x64", "servercore-2022"]`: Windows X64 Servercore 2022 runners non ephemeral based on a custom start script.

The module will decide the runner for the workflow job based on the match in the labels defined in the workflow job and runner configuration. Also the runner configuration allows the match to be exact or non-exact match. We recommend to use only exact matches.

For exact match, all the labels defined in the workflow should be present in the runner configuration matchers and for non-exact match, some of the labels in the workflow, when present in runner configuration, shall be enough for the runner configuration to be used for the job. First the exact matchers are applied, next the non exact ones.

## Webhook

For the list of provided runner configurations, there will be a single webhook and only a single GitHub App to receive the notifications for all types of workflow triggers.

## Multiple GitHub Apps (rate limit distribution)

This example also shows how to optionally configure multiple GitHub Apps via the `additional_github_apps` variable. When configured, the control-plane lambdas (scale-up, scale-down, pool, job-retry) randomly select an app for each GitHub API call, spreading the rate limit usage across all apps. Only the primary app needs a webhook URL configured in GitHub.

## Lambda distribution

Per combination of OS and architecture a lambda distribution syncer will be created. For this example there will be three instances (windows X64, linux X64, linux ARM).

## Usages

Steps for the full setup, such as creating a GitHub app can be found the [docs](https://github-aws-runners.github.io/terraform-aws-github-runner/). First download the Lambda releases from GitHub. Alternatively you can build the lambdas locally with Node or Docker, there is a simple build script in `<root>/.ci/build.sh`. In the `main.tf` you can simply remove the location of the lambda zip files, the default location will work in this case.

> The default example assumes local built lambda's available. Ensure you have built the lambda's. Alternatively you can download the lambda's. The version needs to be set to a GitHub release version, see https://github.com/github-aws-runners/terraform-aws-github-runner/releases

```bash
cd ../lambdas-download
terraform init
terraform apply -var=module_version=<VERSION>
cd -
```


Before running Terraform, ensure the GitHub app is configured. See the [configuration details](https://github-aws-runners.github.io/terraform-aws-github-runner/configuration/) for more details.

```bash
terraform init
terraform apply
```

The example will try to update the webhook of your GitHub. In case the update fails the apply will not fail. You can receive the webhook details by running:

```bash
terraform output -raw webhook_secret
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
| <a name="provider_random"></a> [random](#provider\_random) | 3.8.1 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_base"></a> [base](#module\_base) | ../base | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ../../modules/multi-runner | n/a |
| <a name="module_webhook_github_app"></a> [webhook\_github\_app](#module\_webhook\_github\_app) | ../../modules/webhook-github-app | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_ssm_parameter.al2023_arm64](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [random_id.random](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/id) | resource |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_ssm_parameter.al2023_arm64](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ssm_parameter) | data source |
| [aws_ssm_parameter.al2023_x64](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ssm_parameter) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_ami"></a> [ami](#input\_ami) | AMI configuration applied to each runner configuration. Uses each configuration's AMI when unset. | <pre>object({<br/>    filter               = optional(map(list(string)), { state = ["available"] })<br/>    owners               = optional(list(string), ["amazon"])<br/>    id_ssm_parameter_arn = optional(string, null)<br/>    kms_key_arn          = optional(string, null)<br/>  })</pre> | `null` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region to deploy to | `string` | `"eu-west-1"` | no |
| <a name="input_aws_s3_use_path_style"></a> [aws\_s3\_use\_path\_style](#input\_aws\_s3\_use\_path\_style) | Whether the AWS provider should use path-style S3 addressing. | `bool` | `false` | no |
| <a name="input_configure_github_app"></a> [configure\_github\_app](#input\_configure\_github\_app) | Whether to update the GitHub App webhook after deploying the runners. | `bool` | `true` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | Environment name, used as prefix | `string` | `null` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub for API usages. | <pre>object({<br/>    id         = string<br/>    key_base64 = string<br/>  })</pre> | n/a | yes |
| <a name="input_runner_binaries_syncer_lambda_zip"></a> [runner\_binaries\_syncer\_lambda\_zip](#input\_runner\_binaries\_syncer\_lambda\_zip) | Path to the runner binaries syncer Lambda archive. Uses the module default when unset. | `string` | `null` | no |
| <a name="input_runners_lambda_zip"></a> [runners\_lambda\_zip](#input\_runners\_lambda\_zip) | Path to the runners Lambda archive. Uses the module default when unset. | `string` | `null` | no |
| <a name="input_webhook_lambda_zip"></a> [webhook\_lambda\_zip](#input\_webhook\_lambda\_zip) | Path to the webhook Lambda archive. Uses the module default when unset. | `string` | `null` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_webhook_endpoint"></a> [webhook\_endpoint](#output\_webhook\_endpoint) | n/a |
| <a name="output_webhook_secret"></a> [webhook\_secret](#output\_webhook\_secret) | n/a |
<!-- END_TF_DOCS -->
