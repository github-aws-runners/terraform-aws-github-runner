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
  ami_filter        = { name = ["github-runner-amzn2-x86_64-2021*"] }
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

You can receive the webhook details by running:

```bash
terraform output -raw webhook_secret
```

Be-aware some shells will print some end of line character `%`.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.2 |
| <a name="requirement_local"></a> [local](#requirement\_local) | ~> 2.4 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.5 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | 5.7.0 |
| <a name="provider_random"></a> [random](#provider\_random) | 3.5.1 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_base"></a> [base](#module\_base) | ../base | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ../../ | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_autoscaling_attachment.docker_cache](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/autoscaling_attachment) | resource |
| [aws_autoscaling_group.docker_cache](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/autoscaling_group) | resource |
| [aws_iam_instance_profile.docker_cache](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_instance_profile) | resource |
| [aws_iam_policy.platform_runner_cache_bucket_access_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_policy) | resource |
| [aws_iam_role.docker_cache](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.docker_cache_session_manager_aws_managed](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_launch_template.docker_cache](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/launch_template) | resource |
| [aws_lb.docker_cache](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lb) | resource |
| [aws_lb_listener.docker_cache](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lb_listener) | resource |
| [aws_lb_target_group.docker_cache](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lb_target_group) | resource |
| [aws_route53_record.docker_cache](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_route53_zone.private](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_zone) | resource |
| [aws_s3_bucket.platform_runner_cache](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket_lifecycle_configuration.platform_runner_cache_bucket_lifecycle_configuration](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_lifecycle_configuration) | resource |
| [aws_s3_bucket_policy.platform_runner_cache_bucket_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy) | resource |
| [aws_security_group.docker_cache_sg](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group) | resource |
| [aws_vpc_security_group_ingress_rule.docker](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_security_group_ingress_rule) | resource |
| [random_id.random](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/id) | resource |
| [aws_ami.docker_cache_ami](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ami) | data source |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_iam_policy_document.platform_runner_cache_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_role.platform_runner_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_role) | data source |
| [aws_security_group.runner_sg](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/security_group) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_ami_name_filter"></a> [ami\_name\_filter](#input\_ami\_name\_filter) | n/a | `string` | `"github-runner-ubuntu-jammy-platform-amd64-202307050949"` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | n/a | `string` | `"eu-west-1"` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub for API usages. | <pre>object({<br>    id         = string<br>    key_base64 = string<br>  })</pre> | <pre>{<br>  "id": 0,<br>  "key_base64": "insert base64 app key here\n"<br>}</pre> | no |
| <a name="input_instance_types"></a> [instance\_types](#input\_instance\_types) | n/a | `list(string)` | <pre>[<br>  "c6id.4xlarge"<br>]</pre> | no |
| <a name="input_runner_os"></a> [runner\_os](#input\_runner\_os) | n/a | `string` | `"linux"` | no |
| <a name="input_runner_run_as"></a> [runner\_run\_as](#input\_runner\_run\_as) | n/a | `string` | `"ubuntu"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_webhook_endpoint"></a> [webhook\_endpoint](#output\_webhook\_endpoint) | n/a |
| <a name="output_webhook_secret"></a> [webhook\_secret](#output\_webhook\_secret) | n/a |
<!-- END_TF_DOCS -->