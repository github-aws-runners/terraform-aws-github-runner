# Multi-runner scale-set example

This is the recommended end-to-end example for trying the experimental
multi-runner v2 and GitHub Actions scale-set integration. It creates four
runner lanes in one deployment:

- Linux ARM64 Amazon Linux runners managed by the webhook provider.
- Ephemeral Linux x64 Amazon Linux runners managed by the webhook provider.
- Linux x64 runners managed by a GitHub Actions scale set.
- Windows x64 Server Core 2022 runners managed by the webhook provider.

The v2 interface puts shared settings in `global_config*` and lane-specific
settings in `multi_runner_config`. For example, the VPC and subnets are shared
under `global_config_compute_provider.aws.ec2`; each lane selects its own
instance types and AMI filter.

> **Experimental:** This example uses the experimental v2 interface and
> experimental scale-set orchestration. Do not treat it as a production
> deployment without reviewing the [security boundaries](../../docs/security.md)
> and validating the configuration for your environment.

## Prerequisites

- Terraform 1.5.6 or later.
- AWS credentials with permission to create the resources in this example, in
  a region with at least two availability zones.
- A GitHub App installed in the target organization. Grant the permissions
  `Actions: read`, `Checks: read`, and `Metadata: read` on repositories, plus
  `Self-hosted runners: read and write` for the organization. Subscribe the App
  to `workflow_job` events.
- Access for the target repository to use the runner group selected by the
  example (the default is `Default`).
- An immutable scale-set service image digest from a project release. The
  release notes publish the digest; see the [image verification instructions](../../docs/security.md#attestation).
- GitHub CLI (`gh`) available to Terraform's local provisioner. The example
  updates the GitHub App webhook URL and secret during apply.

The example creates a VPC with a NAT gateway, an ECS Fargate scale-set
controller, and runner infrastructure. AWS charges apply while the resources
exist; the NAT gateway and data transfer can incur charges even when no runner
job is active. Review the generated Terraform plan before applying.

## Configure and deploy

Copy the example variables file and edit the local copy with your values. The
copy is ignored by Git so the GitHub App private key is not committed:

```bash
cp secrets.auto.tfvars.example secrets.auto.tfvars
```

Set the App ID, installation ID, and base64-encoded private key in
`secrets.auto.tfvars`. Set the organization name, environment name, scale-set
name, and immutable controller image digest there too. Keep the private key out
of shell history and source control. Terraform state contains sensitive input
values, so use a secured state backend for deployments beyond local evaluation.
To encode the App private key, run `base64 < app.private-key.pem | tr -d '\n'`
and paste the output into `key_base64`. Obtain the controller image digest from
the release notes; do not use a mutable image tag.

Then initialize and review the plan:

```bash
terraform init
terraform plan
```

Apply only after checking the resources and cost implications:

```bash
terraform apply
```

The example configures the GitHub App webhook as part of apply. The App must
already be installed for the organization and have the permissions described
above.

## Verify a runner

After apply, add a workflow to a repository covered by the App installation and
runner group. The scale-set lane uses the labels `self-hosted`, `linux`, `x64`,
and `scale-set`:

```yaml
name: Scale-set runner smoke test
on: workflow_dispatch
jobs:
  verify:
    runs-on: [self-hosted, linux, x64, scale-set]
    steps:
      - run: echo "Running on the scale-set lane"
```

Dispatch the workflow and confirm it starts on the scale-set runner. For
failures, inspect the controller's CloudWatch log group from the
`scale_set.controller_groups` output, then check the EC2 instance and SSM
parameters created for the lane.

## Clean up

Destroy the example when finished. This removes the VPC, NAT gateway,
controller, and runner resources created by this configuration:

```bash
terraform destroy
```

The GitHub App itself is not deleted. Review the App webhook settings if you
plan to reuse the App elsewhere.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.5.6 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |
| <a name="requirement_local"></a> [local](#requirement\_local) | ~> 2.0 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_random"></a> [random](#provider\_random) | 3.9.0 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_base"></a> [base](#module\_base) | ../base | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ../../modules/multi-runner | n/a |
| <a name="module_webhook_github_app"></a> [webhook\_github\_app](#module\_webhook\_github\_app) | ../../modules/webhook-github-app | n/a |

## Resources

| Name | Type |
|------|------|
| [random_id.random](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/id) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_ami"></a> [ami](#input\_ami) | Optional AMI configuration keyed by runner lane. | <pre>map(object({<br/>    filter = optional(map(list(string)), { state = ["available"] })<br/>    owners = optional(list(string), ["amazon"])<br/>    id_ssm_parameter = optional(object({<br/>      arn = string<br/>    }), null)<br/>    kms_key = optional(object({<br/>      arn = string<br/>    }), null)<br/>  }))</pre> | `{}` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region to deploy to. | `string` | `"eu-west-1"` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | Environment name, used as prefix. | `string` | n/a | yes |
| <a name="input_github"></a> [github](#input\_github) | Optional GitHub endpoint and scale-set ownership settings. | <pre>object({<br/>    url                = optional(string, null)<br/>    ssl_verify         = optional(bool, true)<br/>    runner_owner       = optional(string, null)<br/>    registration_level = optional(string, "organization")<br/>  })</pre> | `{}` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub App ID, base64-encoded private key, and installation ID. | <pre>object({<br/>    id              = string<br/>    key_base64      = string<br/>    installation_id = optional(string, null)<br/>  })</pre> | n/a | yes |
| <a name="input_runner_binaries_enabled"></a> [runner\_binaries\_enabled](#input\_runner\_binaries\_enabled) | Whether runner binary synchronization is enabled. | `bool` | `true` | no |
| <a name="input_scale_set"></a> [scale\_set](#input\_scale\_set) | GitHub Actions scale-set configuration. | <pre>object({<br/>    name              = string<br/>    runner_group_name = optional(string, "Default")<br/>    min_runners       = optional(number, 0)<br/>    container = optional(object({<br/>      image = optional(string, null)<br/>    }), {})<br/>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_webhook_endpoint"></a> [webhook\_endpoint](#output\_webhook\_endpoint) | n/a |
| <a name="output_webhook_secret"></a> [webhook\_secret](#output\_webhook\_secret) | n/a |
<!-- END_TF_DOCS -->
