# Migrate the multi-runner configuration from v1 to v2

Multi-runner v2 changes the configuration contract so that shared defaults,
runner behavior, orchestration, and compute settings have clear ownership.
The v2 contract is nested and provider-oriented; it is not a rename of every
flat v1 variable.

This page explains how to translate the configuration. Moving the existing
Terraform state is a separate step. After updating the configuration, follow
the [v1-to-v2 state migration runbook](multi-runner-v1-v2-migration.md) before
applying v2 to an existing deployment.

## What changes in v2

The v1 interface spreads shared settings across module inputs and puts most
per-runner settings inside `multi_runner_config.<name>.runner_config`.

The v2 interface has two levels:

1. `global_config*` variables hold defaults shared by all runner lanes.
2. `multi_runner_config.<name>` holds a lane's overrides and selects exactly
   one orchestration provider and one compute provider.

The current providers are:

- `orchestration_provider.webhook`
- `compute_provider.aws.ec2`

Global provider blocks supply defaults and shared settings. They do not select
the provider for a lane. Provider selection belongs inside each
`multi_runner_config.<name>` entry.

## Global configuration

Use the following global variables for settings shared by multiple lanes:

| v2 variable | Owns |
| --- | --- |
| `global_config` | Common tags, IAM role defaults, and runner identity defaults |
| `global_config_github` | Primary and additional GitHub Apps, GitHub Enterprise Server, and user agent |
| `global_config_lambda` | Lambda runtime, architecture, artifacts, networking, principals, and role defaults |
| `global_config_orchestration_provider` | Webhook defaults, queues, EventBridge, webhook Lambdas, pool, and scale settings |
| `global_config_ssm` | SSM paths, KMS key, parameter tags, and SSM housekeeper |
| `global_config_observability` | Logs, tracing, and metrics |
| `global_config_compute_provider` | Provider defaults such as EC2 networking, AMI housekeeping, runner binaries, and termination watching |

For example, shared GitHub, runner, observability, webhook, and EC2 defaults
are configured like this:

```hcl
experimental_features = ["multi-runner-v2"]

global_config = {
  tags = {
    Environment = "production"
  }

  runner = {
    os           = "linux"
    architecture = "x64"
    extra_labels = ["self-hosted"]
  }
}

global_config_github = {
  app = {
    id             = var.github_app.id
    key_base64     = var.github_app.key_base64
    webhook_secret = var.github_webhook_secret
  }
}

global_config_observability = {
  logs = {
    retention_in_days = 30
  }
  metrics = {
    enabled = true
  }
}

global_config_orchestration_provider = {
  webhook = {
    eventbridge = {
      enabled       = true
      accept_events = ["workflow_job"]
    }
  }
}

global_config_compute_provider = {
  aws = {
    ec2 = {
      vpc_id      = module.network.vpc_id
      subnet_ids  = module.network.private_subnet_ids
    }
  }
}
```

The other `global_config_*` variables follow the same ownership model. Put a
value in the global block when it is common to all lanes; put an override in a
lane only when that lane needs a different value.

## Per-lane configuration

Each v2 lane is keyed by the same logical runner name used in v1, but its
settings use canonical nested blocks:

```hcl
multi_runner_config = {
  large = {
    runner = {
      name_prefix = "large-"
      extra_labels = ["large"]
    }

    orchestration_provider = {
      webhook = {
        runner = {
          ephemeral     = true
          maximum_count = 10
        }

        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64", "large"]]
        }

        job_retry = {
          enabled = true
        }
      }
    }

    compute_provider = {
      aws = {
        ec2 = {
          instance_types = ["m6i.large"]
        }
      }
    }
  }
}
```

Values are resolved as:

```text
lane override > global default > provider/module default
```

Tags merge at the same levels. A lane override changes only that lane; it does
not change shared singleton resources or defaults for other lanes.

## Common v1-to-v2 translations

The following table covers the most common settings. The exact v1 path can be
either a root module variable or an attribute under
`multi_runner_config.<name>.runner_config`.

| v1 setting | v2 setting |
| --- | --- |
| `github_app` | `global_config_github.app` |
| `additional_github_apps` | `global_config_github.additional_apps` |
| `vpc_id` and `subnet_ids` | `global_config_compute_provider.aws.ec2.vpc_id` and `.subnet_ids` |
| `runner_os` / `runner_config.runner_os` | `global_config.runner.os` or lane `runner.os` |
| `runner_architecture` / `runner_config.runner_architecture` | `global_config.runner.architecture` or lane `runner.architecture` |
| `runner_extra_labels` | `global_config.runner.extra_labels` or lane `runner.extra_labels` |
| `runner_group_name` | `global_config.runner.group_name` or lane `runner.group_name` |
| `runner_name_prefix` | `global_config.runner.name_prefix` or lane `runner.name_prefix` |
| `runner_as_root` / `runner_run_as` | `global_config.runner.run_as_root` / `.run_as` |
| `runner_hook_job_started` / `runner_hook_job_completed` | `global_config.runner.hooks.job_started` / `.job_completed` |
| `runner_iam_role_managed_policy_arns` | `global_config.runner.iam.managed_policy_arns` |
| `runner_metadata_options` | lane `compute_provider.aws.ec2.metadata_options` |
| `runner_ec2_tags` | lane `compute_provider.aws.ec2.tags` |
| `instance_types` | lane `compute_provider.aws.ec2.instance_types` |
| `ami` | lane `compute_provider.aws.ec2.ami` |
| `block_device_mappings` | lane `compute_provider.aws.ec2.block_device_mappings` |
| `enable_ephemeral_runners` | `orchestration_provider.webhook.runner.ephemeral` |
| `enable_jit_config` | `orchestration_provider.webhook.runner.jit_config_enabled` |
| `runners_maximum_count` | `orchestration_provider.webhook.runner.maximum_count` |
| `runner_boot_time_in_minutes` | `orchestration_provider.webhook.runner.boot_time_in_minutes` |
| `runner_matcher_config` / `matcherConfig` | `orchestration_provider.webhook.matcherConfig` |
| `pool_config` | `orchestration_provider.webhook.lambda.pool.config` |
| `job_retry` | `orchestration_provider.webhook.job_retry` |
| `scale_down_idle_confirmation_seconds` | `orchestration_provider.webhook.lambda.scale.down.idle_confirmation_seconds` |
| `idle_config` | `orchestration_provider.webhook.lambda.scale.down.idle_config` |
| `enable_cloudwatch_agent` and `cloudwatch_config` | lane `compute_provider.aws.ec2.cloudwatch_agent` |
| `enable_runner_binaries_syncer` | `global_config_compute_provider.aws.ec2.runner_binaries.enabled` or lane `compute_provider.aws.ec2.binaries_syncer.enabled` |
| `enable_ami_housekeeper` and related settings | `global_config_compute_provider.aws.ec2.ami.housekeeper` |
| termination watcher settings | `global_config_compute_provider.aws.ec2.instance_termination_watcher` |
| `log_level`, `log_class`, `logging_retention_in_days`, and tracing/metrics settings | `global_config_observability` |

Settings that are specific to one lane should remain in that lane instead of
being copied into a global block.

## Legacy and deprecated inputs

The following shapes belong to the stable v1 interface and should not be used
for new v2 configuration:

- Root-level flat runner, webhook, pool, retry, SSM, logging, and EC2 inputs.
- `github_app` and `additional_github_apps` instead of
  `global_config_github`.
- `multi_runner_config.<name>.runner_config` and its flat attributes.
- v1 names such as `enable_ephemeral_runners`, `enable_jit_config`,
  `runners_maximum_count`, `pool_config`, and `job_retry` when they are used
  in the old location.

These legacy inputs remain available for v1 compatibility while the v2
interface is experimental. They are migration sources, not aliases that
should be mixed into a v2 lane. When v2 is enabled, a lane containing the
legacy `runner_config` object is rejected during validation.

The v2 names use canonical ownership and enablement conventions. For example:

```hcl
# v1
multi_runner_config = {
  large = {
    runner_config = {
      enable_ephemeral_runners = true
      enable_jit_config         = true
      runners_maximum_count    = 10
      instance_types            = ["m6i.large"]
    }
  }
}

# v2
multi_runner_config = {
  large = {
    orchestration_provider = {
      webhook = {
        runner = {
          ephemeral          = true
          jit_config_enabled = true
          maximum_count      = 10
        }
      }
    }
    compute_provider = {
      aws = {
        ec2 = {
          instance_types = ["m6i.large"]
        }
      }
    }
  }
}
```

## Feature gate and validation

V2 is selected only by explicitly setting:

```hcl
experimental_features = ["multi-runner-v2"]
```

When the feature is enabled, Terraform validates that:

- The v2 GitHub App is complete under `global_config_github.app`.
- Every lane has a webhook orchestration provider and an AWS EC2 compute
  provider.
- Each lane has EC2 instance types, a VPC, and at least one subnet.
- No lane uses the legacy `runner_config` object.

Do not enable the feature flag until the configuration has been converted and
the state migration has been planned. The feature flag changes which module
resources are selected; it does not move existing state by itself.

## Recommended migration order

1. Copy the v1 configuration and convert it to the v2 nested contract.
2. Keep the same lane keys, resource prefix, AWS account, region, backend, and
   root module address.
3. Validate the v2 configuration without applying it.
4. Use the [state migration runbook](multi-runner-v1-v2-migration.md) to back
   up the v1 state and move the state addresses.
5. Enable `experimental_features = ["multi-runner-v2"]` and run a v2 plan.
6. Review the plan for unexpected replacements or resource recreation.
7. Apply v2 and run a second plan to confirm that it is empty.

Changing the input names without moving state leaves Terraform unable to match
the old v1 addresses to the v2 resources. Conversely, moving state without
converting the configuration leaves the v2 validation and provider contract
unsatisfied.
