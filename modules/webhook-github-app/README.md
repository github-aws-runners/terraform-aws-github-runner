# Module - Update GitHub App Webhook

> This module is treated as internal module, breaking changes will not trigger a major release bump.

> This module is using the local executor to run a bash script.

This module updates the GitHub App webhook with the endpoint and secret and can be changed with the root module. The module is used to update the webhook after applying the examples.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |
| <a name="requirement_null"></a> [null](#requirement\_null) | ~> 3 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.33 |
| <a name="provider_null"></a> [null](#provider\_null) | ~> 3 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_ssm_parameter.key_base64](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/ephemeral-resources/ssm_parameter) | ephemeral resource |
| [null_resource.update_app](https://registry.terraform.io/providers/hashicorp/null/latest/docs/resources/resource) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub app parameters, see your GitHub app. Provide the private key as `key_base64`, the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`), or as `key_base64_ssm`, an SSM parameter holding that value. The SSM value is read with an ephemeral resource and is not stored in plan or state. | <pre>object({<br/>    key_base64     = optional(string)<br/>    key_base64_ssm = optional(object({ arn = string, name = string }))<br/>    id             = string<br/>    webhook_secret = string<br/>  })</pre> | n/a | yes |
| <a name="input_webhook_endpoint"></a> [webhook\_endpoint](#input\_webhook\_endpoint) | The endpoint to use for the webhook, defaults to the endpoint of the runners module. | `string` | n/a | yes |

## Outputs

No outputs.
<!-- END_TF_DOCS -->
