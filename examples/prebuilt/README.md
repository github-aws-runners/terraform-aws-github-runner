# Action runners deployment with prebuilt image

This module shows how to create GitHub action runners using a prebuilt AMI for the runners

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
  ami_filter        = { name = ["github-runner-amzn2-x86_64-2021*"] }
  # provide the owner id of 
  ami_owners        = ["<your owner id>"]

  enabled_userdata = false
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

You can receive the webhook details by running:

```bash
terraform output -raw webhook_secret
```

Be-aware some shells will print some end of line character `%`.
