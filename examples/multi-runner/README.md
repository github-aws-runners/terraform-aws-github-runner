# Action runners deployment of Multiple-Runner-Configurations-Together example

This module shows how to create GitHub action runners with multiple runner configuration together in one deployment. This example has the configurations for the following runner types with the relevant labels supported by them as matchers:

- Linux ARM64 `["self-hosted", "linux", "arm64", "amazon"]`
- Linux Ubuntu `["self-hosted", "linux", "x64", "ubuntu-latest"]` or `["self-hosted", "linux", "x64", "ubuntu-2204"]`
- Linux X64 `["self-hosted", "linux", "x64", "amazon"]`
- Windows X64 `["self-hosted", "windows", "x64", "servercore-2022"]`

The module will decide the runner for the workflow job based on the match in the labels defined in the workflow job and runner configuration. Also the runner configuration allows the match to be exact or non-exact match. We recommend to use only exact matches.

For exact match, all the labels defined in the workflow should be present in the runner configuration matchers and for non-exact match, some of the labels in the workflow, when present in runner configuration, shall be enough for the runner configuration to be used for the job. First the exact matchers are applied, next the non exact ones.

## Webhook

For the list of provided runner configurations, there will be a single webhook and only a single Github App to receive the notifications for all types of workflow triggers.

## Lambda distribution

Per combination of OS and architecture a lambda distribution syncer will be created. For this example there will be three instances (windows X64, linux X64, linux ARM).

## Usages

Steps for the full setup, such as creating a GitHub app can be found the [docs](https://philips-labs.github.io/terraform-aws-github-runner/). First download the Lambda releases from GitHub. Alternatively you can build the lambdas locally with Node or Docker, there is a simple build script in `<root>/.ci/build.sh`. In the `main.tf` you can simply remove the location of the lambda zip files, the default location will work in this case.

> The default example assumes local built lambda's available. Ensure you have built the lambda's. Alternativly you can downlowd the lambda's. The version needs to be set to a GitHub release version, see https://github.com/philips-labs/terraform-aws-github-runner/releases

```bash
cd ../lambdas-download
terraform init
terraform apply -var=module_version=<VERSION>
cd -
```


Before running Terraform, ensure the GitHub app is configured. See the [configuration details](https://philips-labs.github.io/terraform-aws-github-runner/configuration/) for more details.

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
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.27.0 |
| <a name="requirement_local"></a> [local](#requirement\_local) | ~> 2.0 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_random"></a> [random](#provider\_random) | 3.6.0 |

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
| <a name="input_environment"></a> [environment](#input\_environment) | Environment name, used as prefix | `string` | `null` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub for API usages. | <pre>object({<br>    id         = string<br>    key_base64 = string<br>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_webhook_endpoint"></a> [webhook\_endpoint](#output\_webhook\_endpoint) | n/a |
| <a name="output_webhook_secret"></a> [webhook\_secret](#output\_webhook\_secret) | n/a |
<!-- END_TF_DOCS -->
