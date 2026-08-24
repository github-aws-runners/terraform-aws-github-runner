# MiniStack apply test

This fixture applies the `ssm`, `setup-iam-permissions`, and `lambda` modules
against [MiniStack](https://github.com/ministackorg/ministack). It exercises
real AWS provider create, read, and delete calls without an AWS account.

The fixture configures synthetic credentials in the AWS provider, and the
GitHub Actions workflow routes every AWS service to the `ministack` service
container. For a local run, start MiniStack on port 4566 and set the global AWS
endpoint before running Terraform:

```shell
docker run --detach --rm --name terraform-aws-github-runner-ministack \
  --publish 127.0.0.1:4566:4566 \
  --env MINISTACK_ACCOUNT_ID=000000000000 \
  --env MINISTACK_REGION=eu-west-1 \
  ghcr.io/ministackorg/ministack:1.5.0@sha256:ba48c20747780605a4287a950e7bb1758ddc3b55ec92409a0c47677cbe26bbb9

curl --fail --retry 10 --retry-connrefused --retry-delay 1 \
  http://127.0.0.1:4566/_ministack/health

export AWS_ENDPOINT_URL=http://127.0.0.1:4566
export AWS_REGION=eu-west-1
export AWS_EC2_METADATA_DISABLED=true

terraform init -backend=false -input=false
terraform apply -auto-approve -input=false
terraform destroy -auto-approve -input=false
docker stop terraform-aws-github-runner-ministack
```

Run the Terraform commands from this directory. The endpoint input only accepts
the loopback addresses used locally and the service hostname used in CI. The
provider also ignores ambient AWS credentials, and `AWS_ENDPOINT_URL` catches
any AWS service added to the fixture in the future.

This test covers AWS provider and module API compatibility. MiniStack runs with
authorization disabled, so it does not validate IAM policy enforcement, real
KMS encryption, Lambda execution, or AWS service limits.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10.0 |
| <a name="requirement_archive"></a> [archive](#requirement\_archive) | ~> 2.7 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.7 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_archive"></a> [archive](#provider\_archive) | 2.8.0 |
| <a name="provider_aws"></a> [aws](#provider\_aws) | 6.61.0 |
| <a name="provider_random"></a> [random](#provider\_random) | 3.9.0 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_lambda"></a> [lambda](#module\_lambda) | ../../modules/lambda | n/a |
| <a name="module_setup_iam_permissions"></a> [setup\_iam\_permissions](#module\_setup\_iam\_permissions) | ../../modules/setup-iam-permissions | n/a |
| <a name="module_ssm"></a> [ssm](#module\_ssm) | ../../modules/ssm | n/a |

## Resources

| Name | Type |
|------|------|
| [random_password.additional_github_app_key](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/password) | resource |
| [random_password.github_app_key](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/password) | resource |
| [random_password.github_webhook_secret](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/password) | resource |
| [archive_file.lambda](https://registry.terraform.io/providers/hashicorp/archive/latest/docs/data-sources/file) | data source |
| [aws_caller_identity.ministack](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_ministack_endpoint"></a> [ministack\_endpoint](#input\_ministack\_endpoint) | HTTP endpoint for the local MiniStack instance. | `string` | `"http://127.0.0.1:4566"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_applied_resources"></a> [applied\_resources](#output\_applied\_resources) | Representative resources created through the MiniStack AWS API. |
<!-- END_TF_DOCS -->