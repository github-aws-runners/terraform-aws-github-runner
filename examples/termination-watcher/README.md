# Termination watcher

This module shows how to use the termination watcher stand-alone.

## Usages

Ensure you have the lambda for the termination built locally. By default the one in the lambdas folder will be used.

Build lambda's (requires node and yarn).

```bash
cd lambdas
yarn install && yarn dist
```

Next switch to this example directory.

```bash
terraform init
terraform apply
```

Once a Spot instance is terminated a log line and metric will be updated. Spot instance termination can be simulated using the Amazon [Fault Injection Service](https://docs.aws.amazon.com/fis/latest/userguide/what-is.html) (FIS). In the web console you can simply initiate a spot instance failure by navigate in the EC2 console to Spot Requests and choose the action initiate a spot termination event.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.21 |

## Providers

No providers.

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_spot_termination_watchter"></a> [spot\_termination\_watchter](#module\_spot\_termination\_watchter) | ../../modules/termination-watcher | n/a |

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_access_key"></a> [aws\_access\_key](#input\_aws\_access\_key) | Optional AWS access key for the provider. | `string` | `null` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region. | `string` | `"eu-west-1"` | no |
| <a name="input_aws_secret_key"></a> [aws\_secret\_key](#input\_aws\_secret\_key) | Optional AWS secret key for the provider. | `string` | `null` | no |
| <a name="input_config"></a> [config](#input\_config) | Configuration for the spot termination watcher. | `any` | n/a | yes |
| <a name="input_s3_use_path_style"></a> [s3\_use\_path\_style](#input\_s3\_use\_path\_style) | Use path-style S3 requests. | `bool` | `false` | no |
| <a name="input_skip_credentials_validation"></a> [skip\_credentials\_validation](#input\_skip\_credentials\_validation) | Skip AWS credential validation. | `bool` | `false` | no |
| <a name="input_skip_metadata_api_check"></a> [skip\_metadata\_api\_check](#input\_skip\_metadata\_api\_check) | Skip the EC2 metadata API check. | `bool` | `false` | no |
| <a name="input_skip_region_validation"></a> [skip\_region\_validation](#input\_skip\_region\_validation) | Skip AWS region validation. | `bool` | `false` | no |
| <a name="input_skip_requesting_account_id"></a> [skip\_requesting\_account\_id](#input\_skip\_requesting\_account\_id) | Skip requesting the AWS account ID. | `bool` | `false` | no |

## Outputs

No outputs.
<!-- END_TF_DOCS -->
