# EC2 runner trust policy

This internal submodule builds the EC2 runner-role trust policy independently from EC2 resources that consume the runner role. It preserves the default EC2 service trust and optionally merges an additional IAM trust policy document supplied by the common runner stack.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.4.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.33 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_iam_policy_document.assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.default](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_additional_trust_policy_json"></a> [additional\_trust\_policy\_json](#input\_additional\_trust\_policy\_json) | Optional IAM policy document merged with the default EC2 runner-role trust policy. | `string` | `null` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_assume_role_policy"></a> [assume\_role\_policy](#output\_assume\_role\_policy) | EC2 runner-role trust policy with the optional additional trust policy merged into it. |
<!-- END_TF_DOCS -->
