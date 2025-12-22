<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | ~> 1.11 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 6.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | 6.27.0 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_ec2_host.mac_dedicated_host](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ec2_host) | resource |
| [aws_licensemanager_license_configuration.mac_dedicated_host_license_configuration](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/licensemanager_license_configuration) | resource |
| [aws_resourcegroups_group.mac_host_group](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/resourcegroups_group) | resource |
| [aws_resourcegroups_resource.mac_host_membership](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/resourcegroups_resource) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_profile"></a> [aws\_profile](#input\_aws\_profile) | AWS profile (i.e., generated via 'sl aws session generate') to use. | `string` | n/a | yes |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | Default AWS region. | `string` | n/a | yes |
| <a name="input_default_tags"></a> [default\_tags](#input\_default\_tags) | A map of tags to apply to resources. | `map(string)` | n/a | yes |
| <a name="input_host_groups"></a> [host\_groups](#input\_host\_groups) | Map of host groups, each with a name, host instance type, and a list of hosts (name + AZ). | <pre>map(object({<br/>    name               = string<br/>    host_instance_type = string<br/>    hosts = list(object({<br/>      name              = string<br/>      availability_zone = string<br/>    }))<br/>  }))</pre> | n/a | yes |
| <a name="input_tags"></a> [tags](#input\_tags) | A map of tags to apply to resources. | `map(string)` | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_license_specification_arn"></a> [license\_specification\_arn](#output\_license\_specification\_arn) | ARN of the License Manager configuration used for Mac dedicated hosts. |
| <a name="output_resource_group_arns"></a> [resource\_group\_arns](#output\_resource\_group\_arns) | Map of resource group names to their ARNs. |
<!-- END_TF_DOCS -->
