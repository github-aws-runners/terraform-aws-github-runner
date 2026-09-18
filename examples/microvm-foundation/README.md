# MicroVM foundation example

This example creates the regional dependencies required by the Lambda MicroVM
image build and runner runtime using the reusable module in this repository.

Set `aws_region` and `artifact_bucket_name` in `terraform.tfvars` (copy
`terraform.tfvars.example`). The example creates its VPC and private subnets
through the reusable `base` example and wires them into the Network Connector.

```bash
terraform init
terraform apply
terraform output
```

Apply this foundation before building an image with the direct Packer commands
documented in `../../images/microvm-ubuntu/README.md`. Use the outputs as the build inputs:

- `artifact_bucket_name` -> `MICROVM_ARTIFACT_BUCKET`
- `build_role_arn` -> `MICROVM_BUILD_ROLE_ARN`
- `connector_arns.ministack` -> `MICROVM_EGRESS_NETWORK_CONNECTOR_ARN`
- `usage_policy_arn` -> attach to the control-plane role used by the runner example

The foundation module owns regional storage, build IAM, Network Connectors,
and the reusable runtime policy. It does not publish an image or create the
runner control plane; those steps remain explicit and can be performed after
the foundation is available.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.5.6 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.61 |

## Providers

No providers.

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_base"></a> [base](#module\_base) | ../base | n/a |
| <a name="module_microvm_foundation"></a> [microvm\_foundation](#module\_microvm\_foundation) | ../../modules/microvm-foundation | n/a |

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_artifact_bucket_name"></a> [artifact\_bucket\_name](#input\_artifact\_bucket\_name) | Name for the regional MicroVM build-artifact bucket. | `string` | n/a | yes |
| <a name="input_artifact_retention_days"></a> [artifact\_retention\_days](#input\_artifact\_retention\_days) | Number of days to retain current and noncurrent build artifacts. | `number` | `30` | no |
| <a name="input_aws_profile"></a> [aws\_profile](#input\_aws\_profile) | Optional local AWS CLI profile. Leave null when credentials are provided by the environment or role. | `string` | `null` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region in which to create the MicroVM foundation. | `string` | `"eu-west-1"` | no |
| <a name="input_build_policy_name_prefix"></a> [build\_policy\_name\_prefix](#input\_build\_policy\_name\_prefix) | Name prefix for the Lambda MicroVM build policy. | `string` | `"gha-microvm-build-policy-"` | no |
| <a name="input_build_role_name_prefix"></a> [build\_role\_name\_prefix](#input\_build\_role\_name\_prefix) | Name prefix for the Lambda MicroVM build role. | `string` | `"gha-microvm-build-"` | no |
| <a name="input_ecr_repository_arns"></a> [ecr\_repository\_arns](#input\_ecr\_repository\_arns) | Optional private ECR repository ARNs used by the image build. | `set(string)` | `[]` | no |
| <a name="input_image_name_prefix"></a> [image\_name\_prefix](#input\_image\_name\_prefix) | Reserved Lambda MicroVM image-name namespace used by the runtime policy. | `string` | `"gha-ubuntu-arm64"` | no |
| <a name="input_network_connector_operator_role_name_prefix"></a> [network\_connector\_operator\_role\_name\_prefix](#input\_network\_connector\_operator\_role\_name\_prefix) | Name prefix for the Lambda Network Connector operator role. | `string` | `"gha-microvm-network-operator-"` | no |
| <a name="input_tags"></a> [tags](#input\_tags) | Additional tags applied by the foundation module. | `map(string)` | <pre>{<br/>  "Component": "microvm-foundation"<br/>}</pre> | no |
| <a name="input_usage_policy_name_prefix"></a> [usage\_policy\_name\_prefix](#input\_usage\_policy\_name\_prefix) | Name prefix for the Lambda MicroVM runtime usage policy. | `string` | `"gha-microvm-runtime-usage-policy-"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_artifact_bucket_name"></a> [artifact\_bucket\_name](#output\_artifact\_bucket\_name) | S3 bucket to pass to the MicroVM image build. |
| <a name="output_artifact_prefix"></a> [artifact\_prefix](#output\_artifact\_prefix) | S3 prefix used for MicroVM build artifacts. |
| <a name="output_build_role_arn"></a> [build\_role\_arn](#output\_build\_role\_arn) | Lambda build role ARN to pass to the image build. |
| <a name="output_connector_arns"></a> [connector\_arns](#output\_connector\_arns) | Regional Network Connector ARNs keyed by configuration name. |
| <a name="output_usage_policy_arn"></a> [usage\_policy\_arn](#output\_usage\_policy\_arn) | Unattached runtime usage policy for the runner control-plane role. |
<!-- END_TF_DOCS -->
