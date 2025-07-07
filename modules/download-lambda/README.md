# Module - Download lambda artifacts

This module is optional and provides an option to download via Terraform the Lambda artifacts from GitHub.

## Usages

```hcl
module "lambdas" {
  source = "<source location>"
  lambdas = [
    {
      name = "webhook"
      tag  = "v0.15.0"
    },
    {
      name = "runners"
      tag  = "v0.15.0"
    },
    {
      name = "runner-binaries-syncer"
      tag  = "v0.15.0"
    }
  ]
}
```

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 5.27 |
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
| [null_resource.download](https://registry.terraform.io/providers/hashicorp/null/latest/docs/resources/resource) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_lambdas"></a> [lambdas](#input\_lambdas) | Name and tag for lambdas to download. | <pre>list(object({<br/>    name = string<br/>    tag  = string<br/>  }))</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_files"></a> [files](#output\_files) | n/a |
<!-- END_TF_DOCS -->