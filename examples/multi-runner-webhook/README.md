# Multi-runner webhook example

This example exercises the shared experimental multi-runner v2 webhook path
with EC2 and Lambda MicroVM compute. The runner lanes, webhook orchestration,
Lambda artifacts, and GitHub configuration are common; provider-owned inputs
are grouped under `compute_provider`.

The example creates both an EC2 lane and a Lambda MicroVM lane behind the same
webhook endpoint. The MiniStack smoke test sends matching jobs to each lane in
sequence, so adding another provider means adding another lane and provider
specific lifecycle assertions to the same deployment.

The runner-control and webhook Lambda archives are explicit inputs:

```sh
terraform apply \
  -var='runners_lambda_zip=/path/to/runners.zip' \
  -var='webhook_lambda_zip=/path/to/webhook.zip'
```

## MicroVM prerequisites

The MicroVM lane expects an image that has already been built and published in
the target Region. The image is not created by this example. Prepare it in
this order:

1. Apply `examples/microvm-foundation`.
2. Build and release the lifecycle-hook service from
   `lambdas/services/microvm-lifecycle-hooks` using the same artifact process
   used for the repository's Lambda services.
3. Build the image with Packer from `images/microvm-ubuntu`, passing the
   foundation's bucket, connector, build-role, and lifecycle-hook artifact.
4. Set `compute_provider.aws.microvm.image_arn` (and, when applicable,
   `image_version`) to the published image.

The foundation's build role is used to create the image. It is different from
the execution role used by the runner job. The runner configuration owns that
execution role; the control-plane TypeScript passes it to `RunMicrovm` when it
starts an ephemeral runner. The control-plane Lambda therefore needs
permission to pass the configured execution role, and the role needs the
runtime permissions required by the selected runner lane.

This example deploys both EC2 and MicroVM lanes behind one webhook endpoint,
but it does not replace the foundation, image build, lifecycle-hook release,
or execution-role setup steps.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.5.6 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |
| <a name="requirement_null"></a> [null](#requirement\_null) | ~> 3.0 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

No providers.

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_base"></a> [base](#module\_base) | ../base | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ../../modules/multi-runner | n/a |

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS Region where the runner control plane and compute provider resources are deployed. | `string` | `"eu-west-1"` | no |
| <a name="input_compute_provider"></a> [compute\_provider](#input\_compute\_provider) | Provider-specific settings for the EC2 and MicroVM runner lanes. | <pre>object({<br/>    aws = object({<br/>      ec2 = object({<br/>        instance_types = list(string)<br/>        ami = object({<br/>          filter = optional(map(list(string)), { state = ["available"] })<br/>          owners = optional(list(string), ["amazon"])<br/>          id_ssm_parameter = optional(object({<br/>            arn = string<br/>          }), null)<br/>          kms_key = optional(object({<br/>            arn = string<br/>          }), null)<br/>        })<br/>      })<br/>      microvm = object({<br/>        image_arn                  = string<br/>        image_version              = optional(string, null)<br/>        ingress_network_connectors = optional(list(string), [])<br/>        egress_network_connectors  = list(string)<br/>      })<br/>    })<br/>  })</pre> | n/a | yes |
| <a name="input_environment"></a> [environment](#input\_environment) | Name prefix for the example resources. | `string` | n/a | yes |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub App credentials used by the webhook orchestration provider. | <pre>object({<br/>    id             = string<br/>    key_base64     = string<br/>    webhook_secret = string<br/>  })</pre> | n/a | yes |
| <a name="input_github_enterprise_server"></a> [github\_enterprise\_server](#input\_github\_enterprise\_server) | Optional GitHub Enterprise Server endpoint used by the smoke-test API mock. | <pre>object({<br/>    url        = string<br/>    ssl_verify = bool<br/>  })</pre> | `null` | no |
| <a name="input_runners_lambda_zip"></a> [runners\_lambda\_zip](#input\_runners\_lambda\_zip) | Local ZIP file for the runner-control Lambda. | `string` | n/a | yes |
| <a name="input_webhook_lambda_zip"></a> [webhook\_lambda\_zip](#input\_webhook\_lambda\_zip) | Local ZIP file for the webhook Lambda. | `string` | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_webhook_endpoint"></a> [webhook\_endpoint](#output\_webhook\_endpoint) | n/a |
| <a name="output_webhook_secret"></a> [webhook\_secret](#output\_webhook\_secret) | n/a |
<!-- END_TF_DOCS -->
