# Lambda MicroVM Regional Foundation

This module creates the regional AWS prerequisites for building and running
Lambda MicroVM GitHub Actions runners and is intended to be deployed once per
AWS Region.

It manages:

- A private, encrypted, versioned S3 bucket for content-addressed image build artifacts.
- A Lambda-trusted build role with scoped S3, CloudWatch Logs, and optional ECR pull access.
- Dedicated no-ingress security groups and native Lambda Network Connector resources for each configured VPC/subnet set.
- A Lambda-trusted Network Connector operator role and propagation barrier.
- An unattached runtime usage policy for the reserved image namespace and connector inventory.

The module does not create MicroVM images, runner execution roles, or the
runner control plane. Attach `usage_policy_arn` to the control-plane role that
owns the runtime launch operations. The caller must also grant the Terraform
identity `iam:PassRole` for the operator role with
`iam:PassedToService=lambda.amazonaws.com`.

The module deliberately does not configure an AWS provider. Configure the
provider in the root module or example so credentials and account selection
remain caller-owned.

```hcl
provider "aws" {
  region = "eu-west-1"
}

module "microvm_foundation" {
  source = "../../modules/microvm-foundation"

  aws_region                                  = "eu-west-1"
  tags                                        = { Environment = "example" }
  build_policy_name_prefix                    = "github-actions-runner-microvm-build-policy-"
  build_role_name_prefix                      = "github-actions-runner-microvm-build-"
  network_connector_operator_role_name_prefix = "github-actions-runner-microvm-network-operator-"
  usage_policy_name_prefix                    = "github-actions-runner-microvm-runtime-usage-policy-"

  image_name_prefix = "github-actions-runner-ubuntu-arm64"

  network_connectors = {
    cicd = {
      name       = "github-actions-runner-egress"
      vpc_id     = "vpc-0123456789abcdef0"
      subnet_ids = ["subnet-0123456789abcdef0"]
    }
  }
}
```

The companion `examples/microvm-foundation` directory is a complete setup
example. Apply it before following the direct Packer build instructions in
`images/microvm/README.md` or using the `examples/microvm` runner example.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.4.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.61 |
| <a name="requirement_time"></a> [time](#requirement\_time) | >= 0.13 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.61 |
| <a name="provider_time"></a> [time](#provider\_time) | >= 0.13 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_iam_policy.build](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_policy) | resource |
| [aws_iam_policy.usage](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_policy) | resource |
| [aws_iam_role.build](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.operator](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy_attachment.build](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.operator](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_lambdacore_network_connector.connector](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambdacore_network_connector) | resource |
| [aws_s3_bucket.artifacts](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket_lifecycle_configuration.artifacts](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_lifecycle_configuration) | resource |
| [aws_s3_bucket_ownership_controls.artifacts](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_ownership_controls) | resource |
| [aws_s3_bucket_policy.artifacts](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy) | resource |
| [aws_s3_bucket_public_access_block.artifacts](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_public_access_block) | resource |
| [aws_s3_bucket_server_side_encryption_configuration.artifacts](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_server_side_encryption_configuration) | resource |
| [aws_s3_bucket_versioning.artifacts](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_versioning) | resource |
| [aws_security_group.connector](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group) | resource |
| [aws_vpc_security_group_egress_rule.ipv4](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_security_group_egress_rule) | resource |
| [aws_vpc_security_group_egress_rule.ipv6](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_security_group_egress_rule) | resource |
| [time_sleep.operator_role_propagation](https://registry.terraform.io/providers/hashicorp/time/latest/docs/resources/sleep) | resource |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_iam_policy_document.artifact_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.build](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.lambda_service_assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.network_connector_assume_operator_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.usage](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_partition.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/partition) | data source |
| [aws_subnet.selected](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/subnet) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_artifact_bucket_name"></a> [artifact\_bucket\_name](#input\_artifact\_bucket\_name) | Optional name for the regional MicroVM build-artifact bucket. When null, AWS generates the bucket name. | `string` | `null` | no |
| <a name="input_artifact_retention_days"></a> [artifact\_retention\_days](#input\_artifact\_retention\_days) | Number of days to retain current and noncurrent MicroVM build artifacts. | `number` | `30` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region in which to create the Lambda MicroVM prerequisites. | `string` | n/a | yes |
| <a name="input_build_policy_name_prefix"></a> [build\_policy\_name\_prefix](#input\_build\_policy\_name\_prefix) | Name prefix for the Lambda MicroVM build policy. | `string` | n/a | yes |
| <a name="input_build_role_name_prefix"></a> [build\_role\_name\_prefix](#input\_build\_role\_name\_prefix) | Name prefix for the Lambda MicroVM build role. | `string` | n/a | yes |
| <a name="input_ecr_repository_arns"></a> [ecr\_repository\_arns](#input\_ecr\_repository\_arns) | Optional regional ECR repository ARNs from which MicroVM image builds can pull runner base images. | `set(string)` | `[]` | no |
| <a name="input_image_name_prefix"></a> [image\_name\_prefix](#input\_image\_name\_prefix) | IAM namespace prefix reserved for externally published Lambda MicroVM image names. This module does not create or enumerate images. | `string` | n/a | yes |
| <a name="input_network_connector_operator_role_name_prefix"></a> [network\_connector\_operator\_role\_name\_prefix](#input\_network\_connector\_operator\_role\_name\_prefix) | Name prefix for the Lambda Network Connector operator role. | `string` | n/a | yes |
| <a name="input_network_connectors"></a> [network\_connectors](#input\_network\_connectors) | Regional Lambda MicroVM Network Connectors keyed by a stable consumer-defined identity. | <pre>map(object({<br/>    name             = string<br/>    vpc_id           = string<br/>    subnet_ids       = set(string)<br/>    network_protocol = optional(string, "IPv4")<br/>  }))</pre> | n/a | yes |
| <a name="input_tags"></a> [tags](#input\_tags) | A map of module-specific tags to apply to resources. | `map(string)` | n/a | yes |
| <a name="input_usage_policy_name_prefix"></a> [usage\_policy\_name\_prefix](#input\_usage\_policy\_name\_prefix) | Name prefix for the Lambda MicroVM runtime usage policy. | `string` | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_artifact_bucket_arn"></a> [artifact\_bucket\_arn](#output\_artifact\_bucket\_arn) | ARN of the regional S3 bucket used for Lambda MicroVM build artifacts. |
| <a name="output_artifact_bucket_name"></a> [artifact\_bucket\_name](#output\_artifact\_bucket\_name) | Name of the regional S3 bucket used for Lambda MicroVM build artifacts. |
| <a name="output_artifact_prefix"></a> [artifact\_prefix](#output\_artifact\_prefix) | Bucket prefix to which the MicroVM image publisher uploads content-addressed build artifacts. |
| <a name="output_build_role_arn"></a> [build\_role\_arn](#output\_build\_role\_arn) | ARN of the Lambda-trusted role used during MicroVM image builds. |
| <a name="output_connector_arns"></a> [connector\_arns](#output\_connector\_arns) | Map of connector key to the ARN of each Lambda Network Connector. |
| <a name="output_security_group_ids"></a> [security\_group\_ids](#output\_security\_group\_ids) | Map of connector key to its dedicated no-ingress security group ID. |
| <a name="output_usage_policy_arn"></a> [usage\_policy\_arn](#output\_usage\_policy\_arn) | ARN of the reusable regional policy for operating MicroVM images in the reserved namespace and passing their Network Connectors. |
<!-- END_TF_DOCS -->
