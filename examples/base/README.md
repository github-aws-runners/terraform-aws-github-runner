<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 5.27 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | 6.0.0 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_vpc"></a> [vpc](#module\_vpc) | terraform-aws-modules/vpc/aws | 5.0.0 |

## Resources

| Name | Type |
|------|------|
| [aws_resourcegroups_group.resourcegroups_group](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/resourcegroups_group) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region to create the VPC, assuming zones `a` and `b` exists. | `string` | n/a | yes |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | Prefix used for resource naming. | `string` | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_vpc"></a> [vpc](#output\_vpc) | n/a |
<!-- END_TF_DOCS -->
