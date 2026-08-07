# SSM housekeeper module

> This module is treated as an internal module; breaking changes do not trigger a major release bump.

This provider-neutral child module owns the Lambda function, EventBridge schedule, IAM policies, and CloudWatch log group used to remove expired runner registration parameters from Parameter Store.

The module is an implementation detail of the experimental runner stack. It is composed by `runner-stack` and is not intended to be called directly.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.33 |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [aws_cloudwatch_event_rule.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_target.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) | resource |
| [aws_cloudwatch_log_group.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_iam_role.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.ssm_housekeeper_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.ssm_housekeeper_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.ssm_housekeeper_vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_lambda_function.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_permission.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_iam_policy_document.lambda_assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.lambda_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.ssm_housekeeper](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.ssm_housekeeper_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_config"></a> [config](#input\_config) | Provider-neutral SSM housekeeper configuration assembled by runner-stack.<br/><br/>- `prefix`: Prefix used to name the housekeeper resources.<br/>- `aws_partition`: AWS partition used to construct IAM policy ARNs.<br/>- `schedule.expression`: EventBridge schedule expression that invokes the housekeeper.<br/>- `schedule.state`: State of the EventBridge rule.<br/>- `cleanup.token_path`: Parameter Store token path supplied to the Lambda.<br/>- `cleanup.parameter_path_arn`: IAM resource ARN matching `cleanup.token_path`.<br/>- `cleanup.minimum_days_old`: Minimum parameter age before deletion.<br/>- `cleanup.dry_run`: Reports eligible parameters without deleting them when true.<br/>- `lambda.artifact.zip`: Resolved local control-plane archive.<br/>- `lambda.artifact.s3.bucket`: Optional S3 bucket containing the Lambda archive.<br/>- `lambda.artifact.s3.key`: Object key of the Lambda archive.<br/>- `lambda.artifact.s3.object_version`: Optional object version of the Lambda archive.<br/>- `lambda.runtime`: Runtime used by the housekeeper Lambda.<br/>- `lambda.architecture`: Instruction-set architecture used by the housekeeper Lambda.<br/>- `lambda.memory_size`: Memory allocated to the housekeeper Lambda.<br/>- `lambda.timeout`: Housekeeper Lambda timeout in seconds.<br/>- `lambda.vpc.subnet_ids`: Subnets used for Lambda VPC configuration.<br/>- `lambda.vpc.security_group_ids`: Security groups used for Lambda VPC configuration.<br/>- `lambda.role.path`: IAM path used for the housekeeper Lambda role.<br/>- `lambda.role.permissions_boundary`: Optional permissions boundary for the housekeeper role.<br/>- `observability.logs`: Logging level, retention, encryption, and log-class configuration.<br/>- `observability.tracing`: Lambda X-Ray and tracing-helper configuration.<br/>- `tags.resources`: Tags for the housekeeper role and EventBridge rule.<br/>- `tags.lambda`: Tags for the housekeeper Lambda function.<br/>- `tags.log_group`: Tags for the housekeeper log group. | <pre>object({<br/>    prefix        = string<br/>    aws_partition = string<br/>    schedule = object({<br/>      expression = string<br/>      state      = string<br/>    })<br/>    cleanup = object({<br/>      token_path         = string<br/>      parameter_path_arn = string<br/>      minimum_days_old   = number<br/>      dry_run            = bool<br/>    })<br/>    lambda = object({<br/>      artifact = object({<br/>        zip = string<br/>        s3 = object({<br/>          bucket         = optional(string, null)<br/>          key            = optional(string, null)<br/>          object_version = optional(string, null)<br/>        })<br/>      })<br/>      runtime      = string<br/>      architecture = string<br/>      memory_size  = number<br/>      timeout      = number<br/>      vpc = object({<br/>        subnet_ids         = list(string)<br/>        security_group_ids = list(string)<br/>      })<br/>      role = object({<br/>        path                 = string<br/>        permissions_boundary = optional(string, null)<br/>      })<br/>    })<br/>    observability = object({<br/>      logs = object({<br/>        level             = string<br/>        retention_in_days = number<br/>        kms_key_id        = optional(string, null)<br/>        class             = string<br/>      })<br/>      tracing = object({<br/>        mode                  = optional(string, null)<br/>        capture_http_requests = bool<br/>        capture_error         = bool<br/>      })<br/>    })<br/>    tags = object({<br/>      resources = map(string)<br/>      lambda    = map(string)<br/>      log_group = map(string)<br/>    })<br/>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_housekeeper"></a> [housekeeper](#output\_housekeeper) | SSM housekeeper Lambda resources. |
<!-- END_TF_DOCS -->
