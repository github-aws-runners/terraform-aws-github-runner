<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | = 6.35.1 |

## Providers

No providers.

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_runners"></a> [runners](#module\_runners) |  | n/a |
| <a name="module_spot_termination_watchter"></a> [spot\_termination\_watchter](#module\_spot\_termination\_watchter) |  | n/a |
| <a name="module_webhook_github_app"></a> [webhook\_github\_app](#module\_webhook\_github\_app) |  | n/a |

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_ami_name_filter"></a> [ami\_name\_filter](#input\_ami\_name\_filter) | n/a | `string` | `"amzn2-ami-hvm-2.0.20231116.0-x86_64-gp2"` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | n/a | `string` | `"eu-west-1"` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | n/a | `string` | `"ministack-prebuilt"` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | n/a | `map` | <pre>{<br/>  "id": "0",<br/>  "key_base64": "ministack-invalid-key"<br/>}</pre> | no |
| <a name="input_github_app_ssm_parameters"></a> [github\_app\_ssm\_parameters](#input\_github\_app\_ssm\_parameters) | n/a | `map` | <pre>{<br/>  "id": {<br/>    "arn": "arn:aws:ssm:eu-west-1:000000000000:parameter/ministack/terraform-aws-github-runner/github-app/id",<br/>    "name": "/ministack/terraform-aws-github-runner/github-app/id"<br/>  },<br/>  "key_base64": {<br/>    "arn": "arn:aws:ssm:eu-west-1:000000000000:parameter/ministack/terraform-aws-github-runner/github-app/key-base64",<br/>    "name": "/ministack/terraform-aws-github-runner/github-app/key-base64"<br/>  },<br/>  "webhook_secret": {<br/>    "arn": "arn:aws:ssm:eu-west-1:000000000000:parameter/ministack/terraform-aws-github-runner/github-app/webhook-secret",<br/>    "name": "/ministack/terraform-aws-github-runner/github-app/webhook-secret"<br/>  }<br/>}</pre> | no |
| <a name="input_ministack_lambda_archive"></a> [ministack\_lambda\_archive](#input\_ministack\_lambda\_archive) | Absolute path to the inert Lambda archive created by the MiniStack fixture. | `string` | n/a | yes |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | n/a | `string` | `"ministack-base"` | no |

## Outputs

No outputs.
<!-- END_TF_DOCS -->