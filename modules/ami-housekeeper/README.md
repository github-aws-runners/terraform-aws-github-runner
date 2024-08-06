# Module - AMI Housekeeper

This module deploys a Lambda function responsible for deleting outdated AMIs. You can specify various criteria for the deletion process. Please note that the creation of AMIs is not within the scope of this project; the Lambda's role is solely to remove old ones. To avoid potential conflicts, it is recommended to deploy this module only once.

By default, the Lambda will scan all launch templates and assume that only the default version is in use. Any other AMIs referenced in the launch templates will be considered outdated and subject to deletion. Additionally, the module can search for AMIs referenced in AWS Systems Manager (SSM). When you set ssmParameterNames to *ami-id, the module will regard all AMIs referenced in SSM as in use, sparing them from deletion.

You can further refine the deletion process by applying AMI filters, such as those based on tags. The module also offers a 'dry run' option, allowing you to test the Lambda's behavior before executing actual deletions.

## Usages

The module can be activated via the main module by setting `enable_ami_housekeeper` to `true`. Or invoking the module directly.

```
module "ami_housekeeper" {
  source = "path to module"

  prefix = "my-prefix"

  ami_cleanup_config = {
    ssmParameterNames = ["*/ami-id"]
    minimumDaysOld    = 30
    filters = [
      {
        Name   = "tag:Packer"
        Values = ["true"]
      }
    ]
    dryRun = true
  }

  log_level = "debug"
}
```

## Development

## Lambda Function

The Lambda function is written in [TypeScript](https://www.typescriptlang.org/) and requires Node and yarn. Sources are located in [https://github.com/philips-labs/terraform-aws-github-runner/tree/main/lambdas].

### Install

```bash
cd lambdas
yarn install
```

### Test

Test are implemented with [Jest](https://jestjs.io/), calls to AWS and GitHub are mocked.

```bash
yarn run test
```

### Package

To compile all TypeScript/JavaScript sources in a single file [ncc](https://github.com/zeit/ncc) is used.

```bash
yarn run dist
```

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.27 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | ~> 5.27 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_cloudwatch_event_rule.ami_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_target.ami_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) | resource |
| [aws_cloudwatch_log_group.ami_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_iam_role.ami_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.ami_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.ami_housekeeper_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.lambda_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.ami_housekeeper_vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_lambda_function.ami_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_permission.ami_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_iam_policy_document.lambda_assume_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.lambda_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | (optional) partition for the base arn if not 'aws' | `string` | `"aws"` | no |
| <a name="input_cleanup_config"></a> [cleanup\_config](#input\_cleanup\_config) | Configuration for AMI cleanup.<br><br>    `amiFilters` - Filters to use when searching for AMIs to cleanup. Default filter for images owned by the account and that are available.<br>    `dryRun` - If true, no AMIs will be deregistered. Default false.<br>    `launchTemplateNames` - Launch template names to use when searching for AMIs to cleanup. Default no launch templates.<br>    `maxItems` - The maximum numer of AMI's tha will be queried for cleanup. Default no maximum.<br>    `minimumDaysOld` - Minimum number of days old an AMI must be to be considered for cleanup. Default 30.<br>    `ssmParameterNames` - SSM parameter names to use when searching for AMIs to cleanup. This parameter should be set when using SSM to configure the AMI to use. Default no SSM parameters. | <pre>object({<br>    amiFilters = optional(list(object({<br>      Name   = string<br>      Values = list(string)<br>      })),<br>      [{<br>        Name : "state",<br>        Values : ["available"],<br>        },<br>        {<br>          Name : "image-type",<br>          Values : ["machine"],<br>      }]<br>    )<br>    dryRun              = optional(bool, false)<br>    launchTemplateNames = optional(list(string))<br>    maxItems            = optional(number)<br>    minimumDaysOld      = optional(number, 30)<br>    ssmParameterNames   = optional(list(string))<br>  })</pre> | `{}` | no |
| <a name="input_lambda_architecture"></a> [lambda\_architecture](#input\_lambda\_architecture) | AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86\_64' functions. | `string` | `"arm64"` | no |
| <a name="input_lambda_memory_size"></a> [lambda\_memory\_size](#input\_lambda\_memory\_size) | Memory size linit in MB of the lambda. | `number` | `256` | no |
| <a name="input_lambda_principals"></a> [lambda\_principals](#input\_lambda\_principals) | (Optional) add extra principals to the role created for execution of the lambda, e.g. for local testing. | <pre>list(object({<br>    type        = string<br>    identifiers = list(string)<br>  }))</pre> | `[]` | no |
| <a name="input_lambda_runtime"></a> [lambda\_runtime](#input\_lambda\_runtime) | AWS Lambda runtime. | `string` | `"nodejs20.x"` | no |
| <a name="input_lambda_s3_bucket"></a> [lambda\_s3\_bucket](#input\_lambda\_s3\_bucket) | S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly. | `string` | `null` | no |
| <a name="input_lambda_s3_key"></a> [lambda\_s3\_key](#input\_lambda\_s3\_key) | S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas. | `string` | `null` | no |
| <a name="input_lambda_s3_object_version"></a> [lambda\_s3\_object\_version](#input\_lambda\_s3\_object\_version) | S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket. | `string` | `null` | no |
| <a name="input_lambda_schedule_expression"></a> [lambda\_schedule\_expression](#input\_lambda\_schedule\_expression) | Scheduler expression for action runner binary syncer. | `string` | `"rate(1 day)"` | no |
| <a name="input_lambda_security_group_ids"></a> [lambda\_security\_group\_ids](#input\_lambda\_security\_group\_ids) | List of security group IDs associated with the Lambda function. | `list(string)` | `[]` | no |
| <a name="input_lambda_subnet_ids"></a> [lambda\_subnet\_ids](#input\_lambda\_subnet\_ids) | List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`. | `list(string)` | `[]` | no |
| <a name="input_lambda_tags"></a> [lambda\_tags](#input\_lambda\_tags) | Map of tags that will be added to all the lambda function resources. Note these are additional tags to the default tags. | `map(string)` | `{}` | no |
| <a name="input_lambda_timeout"></a> [lambda\_timeout](#input\_lambda\_timeout) | Time out of the lambda in seconds. | `number` | `60` | no |
| <a name="input_lambda_zip"></a> [lambda\_zip](#input\_lambda\_zip) | File location of the lambda zip file. | `string` | `null` | no |
| <a name="input_log_level"></a> [log\_level](#input\_log\_level) | Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'. | `string` | `"info"` | no |
| <a name="input_logging_kms_key_id"></a> [logging\_kms\_key\_id](#input\_logging\_kms\_key\_id) | Specifies the kms key id to encrypt the logs with | `string` | `null` | no |
| <a name="input_logging_retention_in_days"></a> [logging\_retention\_in\_days](#input\_logging\_retention\_in\_days) | Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653. | `number` | `180` | no |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | The prefix used for naming resources | `string` | `"github-actions"` | no |
| <a name="input_role_path"></a> [role\_path](#input\_role\_path) | The path that will be added to the role, if not set the environment name will be used. | `string` | `null` | no |
| <a name="input_role_permissions_boundary"></a> [role\_permissions\_boundary](#input\_role\_permissions\_boundary) | Permissions boundary that will be added to the created role for the lambda. | `string` | `null` | no |
| <a name="input_state_event_rule_ami_housekeeper"></a> [state\_event\_rule\_ami\_housekeeper](#input\_state\_event\_rule\_ami\_housekeeper) | State of the rule. | `string` | `"ENABLED"` | no |
| <a name="input_tags"></a> [tags](#input\_tags) | Map of tags that will be added to created resources. By default resources will be tagged with name and environment. | `map(string)` | `{}` | no |
| <a name="input_tracing_config"></a> [tracing\_config](#input\_tracing\_config) | Configuration for lambda tracing. | <pre>object({<br>    mode                  = optional(string, null)<br>    capture_http_requests = optional(bool, false)<br>    capture_error         = optional(bool, false)<br>  })</pre> | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_lambda"></a> [lambda](#output\_lambda) | n/a |
| <a name="output_lambda_log_group"></a> [lambda\_log\_group](#output\_lambda\_log\_group) | n/a |
| <a name="output_lambda_role"></a> [lambda\_role](#output\_lambda\_role) | n/a |
<!-- END_TF_DOCS -->
