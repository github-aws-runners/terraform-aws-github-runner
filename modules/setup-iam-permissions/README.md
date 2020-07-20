# Module - IAM setup for using boundaries

This module is optional and only added as example. You can deploy the root terraform module via you own IAM user with the right credentials. Alternatively you can create a role to deploy the root module with a limit boundary set.

This module will create an AWS IAM role that is required to use permission boundaries. The created rol can be used to deploy the root module.

## Usages

See below or check out [this example](../../examples/permissions-boundary/README.md)
Create a workspace and add the following terraform code.

```
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

<!-- BEGINNING OF PRE-COMMIT-TERRAFORM DOCS HOOK -->
## Requirements

No requirements.

## Providers

| Name | Version |
|------|---------|
| aws | n/a |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| account\_id | The module allows to switch to the created role from the provided account id. | `string` | n/a | yes |
| environment | A name that identifies the environment, used as prefix and for tagging. | `string` | n/a | yes |
| namespaces | The role will be only allowed to create roles, policies and instance profiles in the given namespace / path. All policies in the boundaries namespace cannot be modified by this role. | <pre>object({<br>    boundary_namespace         = string<br>    role_namespace             = string<br>    policy_namespace           = string<br>    instance_profile_namespace = string<br>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| boundary | n/a |
| role | n/a |

<!-- END OF PRE-COMMIT-TERRAFORM DOCS HOOK -->

## Philips Forest

This module is part of the Philips Forest.

```

                                                     ___                   _
                                                    / __\__  _ __ ___  ___| |_
                                                   / _\/ _ \| '__/ _ \/ __| __|
                                                  / / | (_) | | |  __/\__ \ |_
                                                  \/   \___/|_|  \___||___/\__|

                                                                 Infrastructure

```

Talk to the forestkeepers in the `forest`-channel on Slack.

[![Slack](https://philips-software-slackin.now.sh/badge.svg)](https://philips-software-slackin.now.sh)
