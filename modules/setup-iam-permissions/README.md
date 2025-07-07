# Module - IAM setup for using boundaries

This module is optional and only added as example. You can deploy the root terraform module via you own IAM user with the right credentials. Alternatively you can create a role to deploy the root module with a limit boundary set.

This module will create an AWS IAM role that is required to use permission boundaries. The created rol can be used to deploy the root module.

## Usages

See below or check out [this example](https://github-aws-runners.github.io/terraform-aws-github-runner/examples/permissions-boundary/)
Create a workspace and add the following terraform code.

```hcl
module "iam" {
  source = "../../"

  environment = "default"
  account_id  = "123456789

  namespaces = {
    boundary_namespace         = "boundaries"
    role_namespace             = "runners"
    policy_namespace           = "runners"
    instance_profile_namespace = "runners"
  }
}

output "role" {
  value = module.iam.role
}

output "boundary" {
  value = module.iam.boundary
}
```

Next execute the created Terraform code `terraform init && terraform apply` The module will. You can use the created role in your terraform provider with assume role and the boundary as well the namespace needs to be set to the root module.


<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 5.27 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 5.27 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_iam_policy.boundary](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_policy) | resource |
| [aws_iam_policy.deploy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_policy) | resource |
| [aws_iam_policy.deploy_boundary](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_policy) | resource |
| [aws_iam_role.deploy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy_attachment.deploy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_account_id"></a> [account\_id](#input\_account\_id) | The module allows to switch to the created role from the provided account id. | `string` | n/a | yes |
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | (optional) partition in the arn namespace if not aws | `string` | `"aws"` | no |
| <a name="input_namespaces"></a> [namespaces](#input\_namespaces) | The role will be only allowed to create roles, policies and instance profiles in the given namespace / path. All policies in the boundaries namespace cannot be modified by this role. | <pre>object({<br/>    boundary_namespace         = string<br/>    role_namespace             = string<br/>    policy_namespace           = string<br/>    instance_profile_namespace = string<br/>  })</pre> | n/a | yes |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | The prefix used for naming resources | `string` | `"github-actions"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_boundary"></a> [boundary](#output\_boundary) | n/a |
| <a name="output_role"></a> [role](#output\_role) | n/a |
<!-- END_TF_DOCS -->
