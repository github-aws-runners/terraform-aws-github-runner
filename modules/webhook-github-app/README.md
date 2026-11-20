# Module - Update GitHub App Webhook

> This module is treated as internal module, breaking changes will not trigger a major release bump.

> This module is using the local executor to run a bash script.

This module updates the GitHub App webhook with the endpoint and secret and can be changed with the root module. The module is used to update the webhook after applying the examples.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.5.6 |
| <a name="requirement_null"></a> [null](#requirement\_null) | ~> 3 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_null"></a> [null](#provider\_null) | ~> 3 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [null_resource.update_app](https://registry.terraform.io/providers/hashicorp/null/latest/docs/resources/resource) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub app parameters, see your GitHub app. Provide the private key as `key_base64`, the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`), or as `key_base64_ssm`, an SSM parameter holding that value. The script reads the SSM parameter with the AWS CLI when it runs, so the key is not stored in plan or state. `key_base64_ssm` takes precedence over `key_base64`, and takes the same `{ arn, name }` object as the root module; only `arn` is used. | <pre>object({<br/>    key_base64     = optional(string)<br/>    key_base64_ssm = optional(object({ arn = string, name = string }))<br/>    id             = string<br/>    webhook_secret = string<br/>  })</pre> | n/a | yes |
| <a name="input_ssm_assume_role_arn"></a> [ssm\_assume\_role\_arn](#input\_ssm\_assume\_role\_arn) | IAM role the script assumes before reading `github_app.key_base64_ssm`. Set it when the shell running Terraform has different AWS credentials than the role allowed to read the parameter, for example when the AWS provider assumes a role. | `string` | `null` | no |
| <a name="input_webhook_endpoint"></a> [webhook\_endpoint](#input\_webhook\_endpoint) | The endpoint to use for the webhook, defaults to the endpoint of the runners module. | `string` | n/a | yes |

## Outputs

No outputs.
<!-- END_TF_DOCS -->
