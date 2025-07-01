# Externally managed SSM secrets

This example is based on the [default setup](../default/README.md), but shows how to use configure runners with already existing SSM parameters that you'd have created manually.

Manually creating the SSM parameters that hold the configuration of your GitHub App avoids leaking critical plain text values in your terraform state and version control system. This is a recommended security practice for handling sensitive credentials.

## Prerequisites

To configure GitHub App credentials in AWS, you have two options:

### 1. Using the [`ssm.sh`](./ssm.sh) script

- Edit [`ssm.sh`](./ssm.sh) and set your values
- Run: `source ssm.sh`
- Then run your Terraform commands (`terraform plan` / `terraform apply`)

### 2. Create them manually via the AWS console (or the `aws-cli`)

- Create the following SSM parameters on the AWS console:

```
/github-action-runners/app/github_app_id           (Your GitHub App ID)
/github-action-runners/app/github_app_key_base64   (Your GitHub App Private Key)
/github-action-runners/app/github_app_webhook_secret (Your Installation ID)
```

Example using AWS CLI:

```bash
   # GitHub App ID
   aws ssm put-parameter \
     --name "/github-action-runners/app/github_app_id" \
     --value "YOUR_APP_ID" \
     --type "SecureString"

   # GitHub App Private Key
   aws ssm put-parameter \
     --name "/github-action-runners/app/github_app_key_base64" \
     --value "YOUR_PRIVATE_KEY" \
     --type "SecureString"

   # GitHub App Installation ID
   aws ssm put-parameter \
     --name "/github-action-runners/app/github_app_webhook_secret" \
     --value "YOUR_INSTALLATION_ID" \
     --type "SecureString"
```

- Fill the `arn` and `name` values for each of these inside the [`github_app_ssm_parameters` variable](./variables.tf).

## Usages

Steps for the full setup, such as creating a GitHub app can be found in the root module's [README](https://github.com/philips-labs/terraform-aws-github-runner). First download the Lambda releases from GitHub. Alternatively you can build the lambdas locally with Node or Docker, there is a simple build script in `<root>/.ci/build.sh`. In the `main.tf` you can simply remove the location of the lambda zip files, the default location will work in this case.

> This example assumes local built lambda's available. Ensure you have built the lambda's. Alternativly you can downlowd the lambda's. The version needs to be set to a GitHub release version, see https://github.com/philips-labs/terraform-aws-github-runner/releases

```bash
cd ../lambdas-download
terraform init
terraform apply -var=module_version=<VERSION>
cd -
```

Before running Terraform, ensure the GitHub app is configured. See the [configuration details](https://github.com/philips-labs/terraform-aws-github-runner#usages) for more details.

```bash
terraform init
terraform apply
```

The example will try to update the webhook of your GitHub. In case the update fails the apply will not fail. You can receive the webhook details by running:

```bash
terraform output -raw webhook_secret
```

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.0 |
| <a name="requirement_local"></a> [local](#requirement\_local) | ~> 2.0 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

No providers.

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_base"></a> [base](#module\_base) | ../base | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ../../ | n/a |

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region. | `string` | `"eu-west-1"` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | Environment name, used as prefix. | `string` | `null` | no |
| <a name="input_github_app_ssm_parameters"></a> [github\_app\_ssm\_parameters](#input\_github\_app\_ssm\_parameters) | SSM parameters details for the GitHub App, that you've created manually on AWS. | <pre>object({<br/>    key_base64 = optional(object({<br/>      arn  = string<br/>      name = string<br/>    }))<br/>    id = optional(object({<br/>      arn  = string<br/>      name = string<br/>    }))<br/>    webhook_secret = optional(object({<br/>      arn  = string<br/>      name = string<br/>    }))<br/>  })</pre> | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_note"></a> [note](#output\_note) | n/a |
| <a name="output_runners"></a> [runners](#output\_runners) | n/a |
| <a name="output_webhook_endpoint"></a> [webhook\_endpoint](#output\_webhook\_endpoint) | n/a |
<!-- END_TF_DOCS -->
