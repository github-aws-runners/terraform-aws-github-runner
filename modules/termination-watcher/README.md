# Module - Termination Watcher

This module is watching spot termination events published by the Event Bridge. A lambda function will look up the instance details and create a log line for the notification warning. Optionally a metric will be created.

## Usages

The module is part of the root and multi-runner module but can also be used stand-alone. Below a direction for configuration.

```
module "termination_watcher" {
  source = "path to module"

  config = {
    prefix = "global"
    tag_filters = {
      "ghr:Application" = "github-action-runner"
    }
    metrics_namespace = "My Metrics
    s3_bucket         = "..."
    s3_key            = "..."
    s3_object_version = "..."

    enable_metric = {
      spot_warning = true
    }))
  }
}

```

## Development

The Lambda function is written in [TypeScript](https://www.typescriptlang.org/) and requires Node and yarn. Sources are located in [https://github.com/github-aws-runners/terraform-aws-github-runner/tree/main/lambdas].

### Install

```bash
cd lambdas
yarn install
```

### Test

Test are implemented with [vitest][https://vitest.dev/]), calls to AWS and GitHub are mocked.

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
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.21 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.21 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_deregister_retry_lambda"></a> [deregister\_retry\_lambda](#module\_deregister\_retry\_lambda) | ../lambda | n/a |
| <a name="module_termination_handler"></a> [termination\_handler](#module\_termination\_handler) | ./termination | n/a |
| <a name="module_termination_notification"></a> [termination\_notification](#module\_termination\_notification) | ./notification | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_iam_role_policy.deregister_retry_ec2](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.deregister_retry_sqs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.deregister_retry_ssm](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.notification_sqs_send](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.termination_sqs_send](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_lambda_event_source_mapping.deregister_retry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping) | resource |
| [aws_sqs_queue.deregister_retry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue.deregister_retry_dlq](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_config"></a> [config](#input\_config) | Configuration for the spot termination watcher.<br/><br/>`aws_partition`: Partition for the base arn if not 'aws'<br/>`architecture`: AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86\_64' functions.<br/>`environment_variables`: Environment variables for the lambda.<br/>'features': Features to enable the different lambda functions to handle spot termination events.<br/>`lambda_principals`: Add extra principals to the role created for execution of the lambda, e.g. for local testing.<br/>`lambda_tags`: Map of tags that will be added to created resources. By default resources will be tagged with name and environment.<br/>`log_level`: Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'.<br/>`log_class`: The log class of the CloudWatch log group. Valid values are `STANDARD` or `INFREQUENT_ACCESS`.<br/>`logging_kms_key_id`: Specifies the kms key id to encrypt the logs with<br/>`logging_retention_in_days`: Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653.<br/>`memory_size`: Memory size limit in MB of the lambda.<br/>`prefix`: The prefix used for naming resources.<br/>`role_path`: The path that will be added to the role, if not set the environment name will be used.<br/>`role_permissions_boundary`: Permissions boundary that will be added to the created role for the lambda.<br/>`runtime`: AWS Lambda runtime.<br/>`s3_bucket`: S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly.<br/>`s3_key`: S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas.<br/>`s3_object_version`: S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket.<br/>`security_group_ids`: List of security group IDs associated with the Lambda function.<br/>`subnet_ids`: List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`.<br/>`tag_filters`: Map of tags that will be used to filter the resources to be tracked. Only for which all tags are present and starting with the same value as the value in the map will be tracked.<br/>`tags`: Map of tags that will be added to created resources. By default resources will be tagged with name and environment.<br/>`timeout`: Time out of the lambda in seconds.<br/>`tracing_config`: Configuration for lambda tracing.<br/>`zip`: File location of the lambda zip file.<br/>`enable_runner_deregistration`: Enable or disable deregistering the runner from GitHub when its EC2 instance is terminated.<br/>`github_app_parameters`: GitHub App SSM parameters (`id` and `key_base64`, each a map of `arn`/`name`) used to authenticate to GitHub when deregistering runners.<br/>`ghes_url`: GitHub Enterprise Server URL used to target the GHES API when deregistering runners. Leave `null` for github.com. | <pre>object({<br/>    aws_partition         = optional(string, null)<br/>    architecture          = optional(string, null)<br/>    environment_variables = optional(map(string), {})<br/>    features = optional(object({<br/>      enable_spot_termination_handler              = optional(bool, true)<br/>      enable_spot_termination_notification_watcher = optional(bool, true)<br/>    }), {})<br/>    lambda_tags               = optional(map(string), {})<br/>    log_level                 = optional(string, null)<br/>    log_class                 = optional(string, "STANDARD")<br/>    logging_kms_key_id        = optional(string, null)<br/>    logging_retention_in_days = optional(number, null)<br/>    memory_size               = optional(number, null)<br/>    metrics = optional(object({<br/>      enable    = optional(bool, false)<br/>      namespace = optional(string, "GitHub Runners")<br/>      metric = optional(object({<br/>        enable_spot_termination         = optional(bool, true)<br/>        enable_spot_termination_warning = optional(bool, true)<br/>      }), {})<br/>    }), {})<br/>    prefix = optional(string, null)<br/>    principals = optional(list(object({<br/>      type        = string<br/>      identifiers = list(string)<br/>    })), [])<br/>    role_path                 = optional(string, null)<br/>    role_permissions_boundary = optional(string, null)<br/>    runtime                   = optional(string, null)<br/>    s3_bucket                 = optional(string, null)<br/>    s3_key                    = optional(string, null)<br/>    s3_object_version         = optional(string, null)<br/>    security_group_ids        = optional(list(string), [])<br/>    subnet_ids                = optional(list(string), [])<br/>    tag_filters               = optional(map(string), null)<br/>    tags                      = optional(map(string), {})<br/>    timeout                   = optional(number, null)<br/>    tracing_config = optional(object({<br/>      mode                  = optional(string, null)<br/>      capture_http_requests = optional(bool, false)<br/>      capture_error         = optional(bool, false)<br/>    }), {})<br/>    zip                          = optional(string, null)<br/>    enable_runner_deregistration = optional(bool, false)<br/>    github_app_parameters = optional(object({<br/>      id         = map(string)<br/>      key_base64 = map(string)<br/>    }), null)<br/>    ghes_url = optional(string, null)<br/>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_deregister_retry"></a> [deregister\_retry](#output\_deregister\_retry) | n/a |
| <a name="output_spot_termination_handler"></a> [spot\_termination\_handler](#output\_spot\_termination\_handler) | n/a |
| <a name="output_spot_termination_notification"></a> [spot\_termination\_notification](#output\_spot\_termination\_notification) | n/a |
<!-- END_TF_DOCS -->
