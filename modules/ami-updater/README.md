# AMI Updater Module

This module creates a Lambda function that automatically updates an SSM parameter with the latest AMI ID based on specified filters. The function runs on a schedule and can be configured to run in dry-run mode.

## Features

- Automatically finds the latest AMI based on configurable filters
- Updates SSM parameter with the latest AMI ID
- Supports dry-run mode for testing
- Configurable schedule via EventBridge
- Comprehensive logging and metrics using AWS Lambda Powertools
- Optional VPC configuration
- Optional X-Ray tracing

## Usage

```hcl
module "ami_updater" {
  #source = "./modules/ami-updater"
  source = "git::https://github.com/dgokcin/terraform-aws-github-runner.git//modules/ami-updater?ref=ami-updater-lambda"

  prefix             = "test-${local.github_runner_prefix}-"
  lambda_zip         = "./gh-runner-${local.github_runner_version}-assets/ami-updater.zip"
  ssm_parameter_name = "/github-action-runners/test-latest_ami_id"

  config = {
    dry_run = false
    ami_filter = {
      owners = ["self"]
      filters = [
        {
          name   = "name"
          values = ["runs-on-v2.2-ubuntu24-full-x64-*"]
        },
        {
          name   = "state"
          values = ["available"]
        }
      ]
    }
  }

  # Optional configurations
  schedule_expression = "rate(1 day)"
  state               = "ENABLED"
  lambda_memory_size  = 512
  lambda_timeout      = 30
  log_level           = "info"

  tags = {
    Environment = "prod"
    Project     = "my-project"
  }
}
```

## Requirements

| Name | Version |
|------|---------|
| terraform | >= 1.0 |
| aws | >= 4.0 |

## Providers

| Name | Version |
|------|---------|
| aws | >= 4.0 |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| environment | The environment name for the resources. | `string` | n/a | yes |
| ssm_parameter_name | The name of the SSM parameter to store the latest AMI ID. | `string` | `/github-action-runners/latest_ami_id` | no |
| config | Configuration for the AMI updater. | `object` | n/a | yes |
| aws_partition | The AWS partition to use (e.g., aws, aws-cn) | `string` | `"aws"` | no |
| tags | Map of tags that will be added to created resources | `map(string)` | `{}` | no |
| lambda_runtime | AWS Lambda runtime | `string` | `"nodejs20.x"` | no |
| lambda_architecture | AWS Lambda architecture | `string` | `"x86_64"` | no |
| lambda_timeout | Time out of the lambda in seconds | `number` | `30` | no |
| lambda_memory_size | Lambda memory size limit | `number` | `512` | no |
| role_path | The path that will be added to the role | `string` | `null` | no |
| role_permissions_boundary | Permissions boundary for the role | `string` | `null` | no |
| lambda_subnet_ids | List of subnet IDs for the Lambda VPC config | `list(string)` | `null` | no |
| lambda_security_group_ids | List of security group IDs for the Lambda VPC config | `list(string)` | `null` | no |
| logging_retention_in_days | CloudWatch log retention in days | `number` | `180` | no |
| logging_kms_key_id | KMS key ID for CloudWatch log encryption | `string` | `null` | no |
| schedule_expression | EventBridge schedule expression | `string` | `"rate(1 day)"` | no |
| state | EventBridge rule state | `string` | `"ENABLED"` | no |
| log_level | Lambda function log level | `string` | `"info"` | no |

## Outputs

| Name | Description |
|------|-------------|
| lambda | The Lambda function details |
| role | The IAM role details |
| eventbridge | The EventBridge rule details |

## License

This module is licensed under the MIT License. See the LICENSE file for details.
