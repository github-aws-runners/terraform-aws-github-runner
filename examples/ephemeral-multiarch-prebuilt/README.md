# Ephemeral Multi-Architecture Prebuilt Runners

This example demonstrates how to create GitHub action runners with the following features:

- **Ephemeral Runners**: Runners are used for one job only and terminated after completion
- **Multi-Architecture Support**: Configures both x64 and ARM64 runners
- **Prebuilt AMIs**: Uses custom prebuilt AMIs for faster startup times
- **DynamoDB Storage**: Uses DynamoDB instead of Parameter Store to avoid rate limiting issues
- **Cleanup for Offline Runners**: Includes a lambda to clean up registered offline runners from the organization

## Usages

Steps for the full setup, such as creating a GitHub app can be found in the [docs](https://github-aws-runners.github.io/terraform-aws-github-runner/getting-started/). First download the Lambda releases from GitHub. Alternatively you can build the lambdas locally with Node or Docker, there is a simple build script in `<root>/.ci/build.sh`. In the `main.tf` you can simply remove the location of the lambda zip files, the default location will work in this case.

> The default example assumes local built lambda's available. Ensure you have built the lambda's. Alternatively you can download the lambda's. The version needs to be set to a GitHub release version, see https://github.com/github-aws-runners/terraform-aws-github-runner/releases

```bash
cd ../lambdas-download
terraform init
terraform apply -var=module_version=<VERSION>
cd -
```


### Packer Images

You will need to build your images for both x64 and ARM64 architectures. This example deployment uses the images in `/images/linux-al2023`. You must build these images with packer in your AWS account first. Once you have built them, you need to provide your owner ID as a variable.

### Deploy

Before running Terraform, ensure the GitHub app is configured. See the [configuration details](https://github-aws-runners.github.io/terraform-aws-github-runner/configuration/#ephemeral-runners) for more details.

```bash
terraform init
terraform apply
```


The module will try to update the GitHub App webhook and secret (only linux/mac). You can receive the webhook details by running:

```bash
terraform output webhook_secret
```


## Features

### Ephemeral Runners

Ephemeral runners are used for one job only. Each job requires a fresh instance. This feature should be used in combination with the `workflow_job` event. See GitHub webhook endpoint configuration in the documentation.

### Multi-Architecture Support

This example configures both x64 and ARM64 runners with appropriate labels. The module will decide the runner for the workflow job based on the match in the labels defined in the workflow job and runner configuration.

### DynamoDB Storage

This example uses DynamoDB instead of Parameter Store to store runner configuration and state. This helps avoid rate limiting issues that can occur with Parameter Store when managing many runners.

### Cleanup for Offline Runners

The example includes a lambda function that periodically checks for and removes registered offline runners from the organization. This is particularly useful for handling cases where spot instances are terminated by AWS while still running a job.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.27 |
| <a name="requirement_local"></a> [local](#requirement\_local) | ~> 2.0 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_random"></a> [random](#provider\_random) | 3.6.3 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_base"></a> [base](#module\_base) | ../base | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ../../modules/multi-runner | n/a |
| <a name="module_webhook_github_app"></a> [webhook\_github\_app](#module\_webhook\_github\_app) | ../../modules/webhook-github-app | n/a |

## Resources

| Name | Type |
|------|------|
| [random_id.random](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/id) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region to deploy to | `string` | `"eu-west-1"` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | Environment name, used as prefix | `string` | `null` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub for API usages. | <pre>object({<br/>    id         = string<br/>    key_base64 = string<br/>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_webhook_endpoint"></a> [webhook\_endpoint](#output\_webhook\_endpoint) | n/a |
| <a name="output_webhook_secret"></a> [webhook\_secret](#output\_webhook\_secret) | n/a |
<!-- END_TF_DOCS -->
