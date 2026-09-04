# Multi-runner v2 example

This example demonstrates the experimental multi-runner v2 interface. Shared
defaults are configured with `experimental_global_config*` variables, while
each runner lane uses `experimental_multi_runner_config` for its matcher,
runner lifecycle, and compute-provider settings.

The example creates three lanes from one deployment:

- Linux ARM64 Amazon Linux runners.
- Ephemeral Linux x64 Amazon Linux runners with job retry enabled.
- Windows x64 Server Core 2022 runners.

The v2 interface keeps provider-owned settings inside the selected provider
configuration. For example, VPC and subnet settings are under
`experimental_global_config_compute_provider.aws.ec2`, while the per-lane
instance types and AMI filter are under each lane's compute provider block.

Configure the GitHub App variables before applying:

```bash
terraform init
terraform apply \
  -var='github_app={id="123456",key_base64="..."}'
```

The `github_app` value is sensitive and should be supplied through a secure
variable source in real deployments rather than committed to configuration.

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
| <a name="provider_random"></a> [random](#provider\_random) | 3.9.0 |

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
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region to deploy to. | `string` | `"eu-west-1"` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | Environment name, used as prefix. | `string` | `null` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub App ID and base64-encoded private key. | <pre>object({<br/>    id         = string<br/>    key_base64 = string<br/>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_webhook_endpoint"></a> [webhook\_endpoint](#output\_webhook\_endpoint) | n/a |
| <a name="output_webhook_secret"></a> [webhook\_secret](#output\_webhook\_secret) | n/a |
<!-- END_TF_DOCS -->