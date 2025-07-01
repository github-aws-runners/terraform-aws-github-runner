# Ubuntu custom AMI example

This module shows how to create GitHub action runners using a prebuilt AMI for the runners.

- Configured to run with org level runners.
- GitHub runner binary syncer is not deployed.

@@ Usages


Steps for the full setup, such as creating a GitHub app can be found in the root module's [README](https://github.com/github-aws-runners/terraform-aws-github-runner). First download the Lambda releases from GitHub. Alternatively you can build the lambdas locally with Node or Docker, there is a simple build script in `<root>/.ci/build.sh`. In the `main.tf` you can simply remove the location of the lambda zip files, the default location will work in this case.

> This example assumes local built lambda's available. Ensure you have built the lambda's. Alternatively you can download the lambda's. The version needs to be set to a GitHub release version, see https://github.com/github-aws-runners/terraform-aws-github-runner/releases

```bash
cd ../lambdas-download
terraform init
terraform apply -var=module_version=<VERSION>
cd -
```

### Packer Image

You will need to build your image. This example deployment uses the image example in `/images/linux-amz2`. You must build this image with packer in your AWS account first. Once you have built this you need to provider your owner ID as a variable

## Deploy

To use your image in the terraform modules you will need to set some values on the module.

Assuming you have built the `linux-al2023` image which has a pre-defined AMI name in the following format `github-runner-al2023-x86_64-YYYYMMDDhhmm` you can use the following values.

```hcl
module "runners" {
  ...
  # set the name of the ami to use
  ami_filter        = { name = ["github-runner-al2023-x86_64-2023*"], state = ["available"] }
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
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 5.27 |
| <a name="requirement_local"></a> [local](#requirement\_local) | ~> 2.0 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | 5.82.1 |
| <a name="provider_random"></a> [random](#provider\_random) | 3.6.3 |

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
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_ami_name_filter"></a> [ami\_name\_filter](#input\_ami\_name\_filter) | AMI name filter for the action runner AMI. By default amazon linux 2 is used. | `string` | `"github-runner-al2023-x86_64-*"` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region. | `string` | `"eu-west-1"` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | Environment name, used as prefix. | `string` | `null` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub for API usages. | <pre>object({<br/>    id         = string<br/>    key_base64 = string<br/>  })</pre> | n/a | yes |
| <a name="input_runner_os"></a> [runner\_os](#input\_runner\_os) | The EC2 Operating System type to use for action runner instances (linux,windows). | `string` | `"linux"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_webhook_endpoint"></a> [webhook\_endpoint](#output\_webhook\_endpoint) | n/a |
| <a name="output_webhook_secret"></a> [webhook\_secret](#output\_webhook\_secret) | n/a |
<!-- END_TF_DOCS -->
