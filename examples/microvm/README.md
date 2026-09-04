# Lambda MicroVM runner example

This example creates the VPC and GitHub Actions runner control plane for one
Linux ARM64 Lambda MicroVM lane. The lane uses ephemeral runners and
just-in-time configuration, which are required by the MicroVM provider.

The regional MicroVM foundation is provisioned separately by the
[`microvm-foundation`](../microvm-foundation) example. Apply that example
first and provide its artifact bucket, build role, and egress Network Connector
outputs to the image build script. The image ARN produced by that build is then
supplied to this example.

The GitHub App credentials must already exist in SSM Parameter Store. The
example outputs the webhook endpoint; configure that endpoint on the GitHub
App with the same secret stored in the referenced SSM parameter.

## Usage

Build or download the Lambda archives into an S3 bucket, then create a
`terraform.tfvars` file. The parameter references below are examples only:

```hcl
aws_region             = "eu-west-1"
lambda_artifact_bucket = "my-runner-lambda-artifacts"
microvm_image_arn      = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:github-runner-arm64"
egress_network_connector_arn = "arn:aws:lambda:eu-west-1:123456789012:network-connector:example"

github_app = {
  key_base64_ssm = {
    arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-key"
    name = "/github-runner/app-key"
  }
  id_ssm = {
    arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
    name = "/github-runner/app-id"
  }
  webhook_secret_ssm = {
    arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/webhook-secret"
    name = "/github-runner/webhook-secret"
  }
}
```

Run Terraform from this directory:

```bash
terraform init
terraform apply
terraform output -raw webhook_endpoint
```

The MicroVM image must be built for Linux ARM64 and should use a versioned image
ARN in production. Network connector egress remains bounded by the VPC route
tables and network ACLs configured by the helper module.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |

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
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS Region where the runner control plane and MicroVM resources are deployed. | `string` | `"eu-west-1"` | no |
| <a name="input_egress_network_connector_arn"></a> [egress\_network\_connector\_arn](#input\_egress\_network\_connector\_arn) | Regional Lambda Network Connector ARN used by MicroVMs and the image build. | `string` | n/a | yes |
| <a name="input_environment"></a> [environment](#input\_environment) | Name prefix for the example resources. | `string` | `null` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | Pre-created SSM parameter references for the GitHub App credentials. | <pre>object({<br/>    key_base64 = optional(string)<br/>    key_base64_ssm = optional(object({<br/>      arn  = string<br/>      name = string<br/>    }))<br/>    id = optional(string)<br/>    id_ssm = optional(object({<br/>      arn  = string<br/>      name = string<br/>    }))<br/>    webhook_secret = optional(string)<br/>    webhook_secret_ssm = optional(object({<br/>      arn  = string<br/>      name = string<br/>    }))<br/>  })</pre> | n/a | yes |
| <a name="input_ingress_network_connector_arns"></a> [ingress\_network\_connector\_arns](#input\_ingress\_network\_connector\_arns) | Optional regional Lambda Network Connector ARNs exposed to MicroVMs. | `list(string)` | `[]` | no |
| <a name="input_lambda_artifact_bucket"></a> [lambda\_artifact\_bucket](#input\_lambda\_artifact\_bucket) | S3 bucket containing the runner-control Lambda artifacts. | `string` | n/a | yes |
| <a name="input_microvm_image_arn"></a> [microvm\_image\_arn](#input\_microvm\_image\_arn) | Lambda MicroVM image ARN produced by the MicroVM image build. | `string` | n/a | yes |
| <a name="input_microvm_image_version"></a> [microvm\_image\_version](#input\_microvm\_image\_version) | Optional immutable version of the Lambda MicroVM image. | `string` | `null` | no |
| <a name="input_organization_runners"></a> [organization\_runners](#input\_organization\_runners) | Register the MicroVM runners at organization scope when true. | `bool` | `false` | no |
| <a name="input_runners_lambda_s3_key"></a> [runners\_lambda\_s3\_key](#input\_runners\_lambda\_s3\_key) | S3 key for the runners Lambda archive. | `string` | `"runners.zip"` | no |
| <a name="input_runners_maximum_count"></a> [runners\_maximum\_count](#input\_runners\_maximum\_count) | Maximum number of concurrent MicroVM runners. | `number` | `10` | no |
| <a name="input_webhook_lambda_s3_key"></a> [webhook\_lambda\_s3\_key](#input\_webhook\_lambda\_s3\_key) | S3 key for the webhook Lambda archive. | `string` | `"webhook.zip"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_microvm_image_arn"></a> [microvm\_image\_arn](#output\_microvm\_image\_arn) | The MicroVM image ARN consumed by this runner configuration. |
| <a name="output_webhook_endpoint"></a> [webhook\_endpoint](#output\_webhook\_endpoint) | Webhook endpoint to configure on the GitHub App. |
<!-- END_TF_DOCS -->
