# Action runners deployment with prebuilt image

This module shows how to create GitHub action runners using a prebuilt AMI for the runners.

- Configured to run with org level runners.
- GitHub runner binary syncer is not deployed.

## Usages

Steps for the full setup, such as creating a GitHub app can be found in the root module's [README](../../README.md).

## Variables

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_ami_filter"></a> [ami\_filter](#input\_ami\_filter) | The amis to search.  Use the default for the provided amazon linux image, `github-runner-windows-core-2019-*` for the provided Windows image | `string` | `github-runner-amzn2-x86_64-2021*` | no |
| <a name="input_github_app_key_base64"></a> [github\_app\_key\_base64](#input\_github\_app\_key\_base64) | The base64 encoded private key you downloaded from GitHub when creating the app | `string` | | yes |
| <a name="input_github_app_id"></a> [github\_app\_id](#input\_github\_app\_id) | The id of the app you created on GitHub | `string` | | yes |
| <a name="input_region"></a> [region](#input\_region) | The target aws region | `string` | `eu-west-1` | no |
| <a name="input_runner_os"></a> [runner\_os](#input\_runner\_os) | The os of the image, either `linux` or `windows` | `string` | `linux` | no |

### Lambdas

You can either download the released lambda code or build them locally yourself.

First download the Lambda releases from GitHub. Ensure you have set the version in `lambdas-download/main.tf` for running the example. The version needs to be set to a GitHub release version, see https://github.com/philips-labs/terraform-aws-github-runner/releases

```bash
cd lambdas-download
terraform init
terraform apply
cd ..
```

Alternatively you can build the lambdas locally with Node or Docker, there is a simple build script in `<root>/.ci/build.sh`. In the `main.tf` you need to specify the build location for all of the zip files.

```hcl
  webhook_lambda_zip                = "../../lambda_output/webhook.zip"
  runner_binaries_syncer_lambda_zip = "../../lambda_output/runner-binaries-syncer.zip"
  runners_lambda_zip                = "../../lambda_output/runners.zip"
```

### GitHub App Configuration

Before running Terraform, ensure the GitHub app is configured. See the [configuration details](../../README.md#usages) for more details.

### Packer Image

You will need to build your image. This example deployment uses the image example in `/images/linux-amz2`. You must build this image with packer in your AWS account first. Once you have built this you need to provider your owner ID as a variable

## Deploy

To use your image in the terraform modules you will need to set some values on the module.

Assuming you have built the `linux-amzn2` image which has a pre-defined AMI name in the following format `github-runner-amzn2-x86_64-YYYYMMDDhhmm` you can use the following values.

```hcl
module "runners" {
  ...
  # set the name of the ami to use
  ami_filter  = { name = ["github-runner-amzn2-x86_64-2021*"], state = ["available"] }
  # provide the owner id of
  ami_owners        = ["<your owner id>"]

  enable_userdata = false
  ...
}
```

If your owner is the same as the account you are logging into then you can use `aws_caller_identity` to retrieve it dynamically.

```hcl
data "aws_caller_identity" "current" {}

module "runners" {
  ...
  ami_owners       = [data.aws_caller_identity.current.account_id]
  ...
}
```

You can then deploy the terraform

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
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.2 |
| <a name="requirement_local"></a> [local](#requirement\_local) | ~> 2.0 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | 5.2.0 |
| <a name="provider_random"></a> [random](#provider\_random) | 3.5.1 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_base"></a> [base](#module\_base) | ../base | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ../../ | n/a |
| <a name="module_webhook-github-app"></a> [webhook-github-app](#module\_webhook-github-app) | ../../modules/webhook-github-app | n/a |

## Resources

| Name | Type |
|------|------|
| [random_id.random](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/id) | resource |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_ami_name_filter"></a> [ami\_name\_filter](#input\_ami\_name\_filter) | n/a | `string` | `"github-runner-amzn2-x86_64-*"` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub for API usages. | <pre>object({<br>    id         = string<br>    key_base64 = string<br>  })</pre> | n/a | yes |
| <a name="input_runner_os"></a> [runner\_os](#input\_runner\_os) | n/a | `string` | `"linux"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_webhook_endpoint"></a> [webhook\_endpoint](#output\_webhook\_endpoint) | n/a |
| <a name="output_webhook_secret"></a> [webhook\_secret](#output\_webhook\_secret) | n/a |
<!-- END_TF_DOCS -->
