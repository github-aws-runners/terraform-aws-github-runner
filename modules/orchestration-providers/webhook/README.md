# Webhook orchestration provider

This internal module owns the event-driven runner demand controls used by `runner-config`: scale-up, scale-down, scheduled pool reconciliation, and optional queued-job retry. It receives the common GitHub, Lambda, runner-registration, SSM, observability, and selected compute-provider contracts from the parent configuration module, then resolves webhook-specific defaults and tag precedence before invoking its leaf modules. Lifecycle, boot time, and capacity are provider-owned under `config.runner`; the provider resolves the lifecycle contract for runner bootstrap, forwards capacity to scale-up and pool, and forwards boot time to scale-down and pool. It also combines the shared Lambda artifact bucket with its own `config.lambda.artifact` zip or S3 key/version shared by scale, pool, and job-retry; provider-specific artifact fields do not leak into the common Lambda contract.

`runner-config` selects this provider when `orchestration.webhook` is the one populated orchestration block. The parent continues to own common runner resources, shared SSM configuration, and compute-provider selection. A future orchestration provider should be implemented as a sibling module with the same parent-facing resource boundary; it should not add its stateful resources to this webhook module.

The scale-down lifecycle is documented in the [scale-down state diagram](./scale-down-state-diagram.md).

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
| <a name="module_job_retry"></a> [job\_retry](#module\_job\_retry) | ./job-retry | n/a |
| <a name="module_pool"></a> [pool](#module\_pool) | ./pool | n/a |
| <a name="module_scale_runners"></a> [scale\_runners](#module\_scale\_runners) | ./scale-runners | n/a |

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | AWS partition used to construct ARNs. | `string` | `"aws"` | no |
| <a name="input_config"></a> [config](#input\_config) | Resolved provider-owned values from orchestration.webhook, including runner lifecycle, boot timeout, and capacity limits used by scaling and pool controls. | <pre>object({<br/>    runner = object({<br/>      boot_time_in_minutes = number<br/>      ephemeral            = bool<br/>      jit_config_enabled   = optional(bool, null)<br/>      maximum_count        = number<br/>    })<br/>    github = object({<br/>      organization_runners = bool<br/>    })<br/>    queue = object({<br/>      build = object({<br/>        arn = string<br/>        url = string<br/>      })<br/>      kms_key_id = optional(string, null)<br/>      tags       = optional(map(string), {})<br/>    })<br/>    lambda = object({<br/>      artifact = object({<br/>        zip = optional(string, null)<br/>        s3 = optional(object({<br/>          key            = string<br/>          object_version = optional(string, null)<br/>        }), null)<br/>      })<br/>      scale = object({<br/>        up = object({<br/>          memory_size                    = number<br/>          timeout                        = number<br/>          reserved_concurrent_executions = number<br/>          job_queued_check_enabled       = optional(bool, null)<br/>          event_source_mapping = object({<br/>            batch_size                         = number<br/>            maximum_batching_window_in_seconds = number<br/>          })<br/>          tags = optional(map(string), {})<br/>        })<br/>        down = object({<br/>          memory_size                     = number<br/>          timeout                         = number<br/>          schedule_expression             = string<br/>          minimum_running_time_in_minutes = optional(number, null)<br/>          idle_config = list(object({<br/>            cron             = string<br/>            timeZone         = string<br/>            idleCount        = number<br/>            evictionStrategy = string<br/>          }))<br/>          tags = optional(map(string), {})<br/>        })<br/>      })<br/>      pool = object({<br/>        memory_size                    = number<br/>        timeout                        = number<br/>        reserved_concurrent_executions = number<br/>        config = list(object({<br/>          schedule_expression          = string<br/>          schedule_expression_timezone = optional(string)<br/>          size                         = number<br/>        }))<br/>        include_busy_runners = bool<br/>        runner_owner         = optional(string, null)<br/>        tags                 = optional(map(string), {})<br/>      })<br/>    })<br/>    job_retry = object({<br/>      enabled          = bool<br/>      delay_in_seconds = number<br/>      delay_backoff    = number<br/>      max_attempts     = number<br/>      tags             = optional(map(string), {})<br/>      lambda = object({<br/>        memory_size                    = number<br/>        reserved_concurrent_executions = number<br/>        timeout                        = number<br/>      })<br/>    })<br/>  })</pre> | n/a | yes |
| <a name="input_github"></a> [github](#input\_github) | Common GitHub API client and GitHub App Parameter Store references. | <pre>object({<br/>    app_parameters = object({<br/>      key_base64      = list(map(string))<br/>      id              = list(map(string))<br/>      installation_id = list(object({ name = string, arn = string }))<br/>    })<br/>    enterprise_server = object({<br/>      url        = optional(string, null)<br/>      ssl_verify = bool<br/>    })<br/>    user_agent = optional(string, null)<br/>  })</pre> | n/a | yes |
| <a name="input_lambda"></a> [lambda](#input\_lambda) | Common Lambda substrate. Only the shared artifact bucket crosses this boundary; the webhook provider owns its archive key, version, and local zip selection. | <pre>object({<br/>    artifact = object({<br/>      s3 = object({<br/>        bucket = optional(string, null)<br/>      })<br/>    })<br/>    runtime            = string<br/>    architecture       = string<br/>    subnet_ids         = list(string)<br/>    security_group_ids = list(string)<br/>    tags               = optional(map(string), {})<br/>    role = object({<br/>      path                 = string<br/>      permissions_boundary = optional(string, null)<br/>      principals = optional(list(object({<br/>        type        = string<br/>        identifiers = list(string)<br/>      })), [])<br/>    })<br/>  })</pre> | n/a | yes |
| <a name="input_observability"></a> [observability](#input\_observability) | Common logging, tracing, and metrics configuration consumed by webhook controls. | <pre>object({<br/>    logs = object({<br/>      level             = string<br/>      retention_in_days = number<br/>      kms_key_id        = optional(string, null)<br/>      class             = string<br/>      tags              = optional(map(string), {})<br/>    })<br/>    tracing = object({<br/>      mode                  = optional(string, null)<br/>      capture_http_requests = bool<br/>      capture_error         = bool<br/>    })<br/>    metrics = object({<br/>      enable    = bool<br/>      namespace = string<br/>      metric = object({<br/>        enable_github_app_rate_limit = bool<br/>        enable_job_retry             = bool<br/>      })<br/>    })<br/>  })</pre> | n/a | yes |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | Prefix used to identify resources created for this webhook orchestration provider. | `string` | n/a | yes |
| <a name="input_runner"></a> [runner](#input\_runner) | Common runner registration values consumed by webhook demand controls. Lifecycle, boot timeout, and capacity remain provider-owned under config.runner. | <pre>object({<br/>    os                   = string<br/>    auto_update_disabled = bool<br/>    labels               = list(string)<br/>    group_name           = string<br/>    name_prefix          = string<br/>  })</pre> | n/a | yes |
| <a name="input_runner_provider"></a> [runner\_provider](#input\_runner\_provider) | Selected compute-provider capabilities consumed by webhook scaling, pool, and retry controls. | <pre>object({<br/>    type = string<br/>    scale_up = object({<br/>      environment_variables      = map(string)<br/>      iam_policy_json            = string<br/>      additional_iam_policy_json = optional(string, null)<br/>      managed_policy = optional(object({<br/>        arn = string<br/>      }), null)<br/>    })<br/>    scale_down = object({<br/>      environment_variables = map(string)<br/>      iam_policy_json       = string<br/>    })<br/>    pool = object({<br/>      environment_variables  = map(string)<br/>      iam_policy_json        = string<br/>      managed_policy_enabled = bool<br/>      managed_policy_arn     = optional(string, null)<br/>    })<br/>  })</pre> | n/a | yes |
| <a name="input_ssm"></a> [ssm](#input\_ssm) | Resolved Parameter Store paths, optional decrypt key, and runtime parameter tags. | <pre>object({<br/>    token_path           = string<br/>    token_path_arn       = string<br/>    config_path          = string<br/>    config_path_arn      = string<br/>    kms_key_id           = optional(string, null)<br/>    parameter_store_tags = string<br/>  })</pre> | n/a | yes |
| <a name="input_tags"></a> [tags](#input\_tags) | Base tags available to webhook-provider resources. Component-specific tags override this map within their documented scopes. | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_job_retry"></a> [job\_retry](#output\_job\_retry) | Job-retry resources. Null when job retry is disabled. |
| <a name="output_pool"></a> [pool](#output\_pool) | Scheduled pool resources. Null when no pool schedule is configured. |
| <a name="output_runner_lifecycle"></a> [runner\_lifecycle](#output\_runner\_lifecycle) | Effective webhook-owned runner lifecycle consumed by runner-config bootstrap parameters. |
| <a name="output_scale_down"></a> [scale\_down](#output\_scale\_down) | Scale-down control-plane resources. |
| <a name="output_scale_up"></a> [scale\_up](#output\_scale\_up) | Scale-up control-plane resources. |
<!-- END_TF_DOCS -->
