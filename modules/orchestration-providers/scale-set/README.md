# Scale-set orchestration provider

This internal module deploys long-running GitHub Actions runner scale-set controllers on ECS Fargate. It creates one deployment unit per resolved **controller group**:

```text
1 ECS service
1 task definition
1 running task during normal operation
1 application container
1 ScaleSetController supervising N independent reconcilers
```

Each reconciler still owns exactly one GitHub scale-set ID and one message session. Grouping only packs reconcilers into a shared task; it does not merge scale-set identity, session state, or compute-provider behavior. It does, however, intentionally union task IAM permissions and failure/deployment blast radius across all members of that controller group.

This foundation adopts scale sets that were created elsewhere. It validates the supplied ID, expected name, and optional runner-group ID at runtime, but it does not create or delete the GitHub scale-set resource. The complete compute-provider contract must likewise come from its Terraform adapter; until that adapter and the public runner-config selection are wired, this internal module is not an end-to-end deployment interface.

The normalized `(github.config_url, scale_set.id)` ownership tuple must be globally unique across all groups. Duplicate detection normalizes URL case, one trailing slash, and an explicit default `:443` port, so equivalent spellings cannot accidentally deploy two services against one GitHub message session. Numeric scale-set IDs may repeat under different GitHub scopes.

## Grouping

`grouping.strategy` selects a plan-known grouping implementation:

- `compute_provider` (default): one group per `compute_provider_contracts[*].type`.
- `runner_config`: one group per runner-config key.
- `custom`: explicit groups whose membership covers every runner config exactly once.

```hcl
grouping = {
  strategy = "custom"
  custom = {
    groups = {
      general = {
        runner_configs = ["linux-small", "linux-large"]
      }
      critical = {
        runner_configs = ["production"]
      }
    }
  }
}
```

Group names and memberships become Terraform `for_each` identities and must be known during planning. A group may contain at most 1000 runner configs, matching the service loader limit. Additional grouping algorithms can be added later by producing the same internal `map(list(runner_config_name))` shape.

## Compute-provider capability boundary

`compute_provider_contracts` is keyed exactly like `runner_configs`. A compute provider implements the scale-set desired-capacity interface by returning:

```hcl
{
  type = "ec2" # plan-known grouping and runtime registry key
  capabilities = {
    scale_set = {
      configuration_json = local.provider_owned_runtime_configuration
      environment_variables = local.provider_owned_non_secret_environment
      iam_statements     = local.provider_owned_task_role_statements
    }
  }
}
```

The symbolic locals above represent outputs from the selected compute-provider Terraform adapter; callers should not recreate the provider payload by hand. The provider-specific adapter owns the runtime configuration schema and the complete IAM statement set. This orchestration module treats configuration JSON as an opaque, non-secret object and combines only the selected group's statements into that group's task role. Provider-owned process environment variables are also non-secret: duplicate names within a group must resolve to the same value, and reserved runtime names cannot be overridden. Runner-config-specific values stay in the SSM reconciler document, while credentials stay behind SSM references. Wildcard IAM actions are rejected. The rendered per-group policy is checked against AWS's 10,240-byte inline role-policy quota with an explicit split-the-group error; group splitting remains the escape hatch when the union is too large or too broad.

## Configuration delivery

Large groups do not embed their full manifest in an ECS task definition. The module writes one non-secret SSM `String` parameter per reconciler:

```text
/<prefix>/scale-set-controller/<controller-group>/<runner-config>
```

Each leaf is the flat `ScaleSetReconcilerConfig` consumed by the service:

```json
{
  "schemaVersion": 1,
  "runnerConfigName": "linux-small",
  "githubConfigUrl": "https://github.com/example",
  "scaleSetId": 123,
  "expectedScaleSetName": "linux-small",
  "expectedRunnerGroupId": null,
  "minRunners": 0,
  "maxRunners": 20,
  "bootTimeoutMinutes": 10,
  "githubApp": {
    "appIdParameterName": "/github/app-id",
    "privateKeyParameterName": "/github/private-key",
    "installationIdParameterName": "/github/installation-id"
  },
  "computeProvider": {
    "type": "ec2",
    "configuration": {}
  }
}
```

The task receives only the group name, group path, and a SHA-256 revision. It loads the direct children with `GetParametersByPath`. Standard parameters are limited to 4096 encoded bytes and Advanced parameters to 8192 encoded bytes; Terraform validates every leaf against the selected tier and limits the decoded aggregate for one group to 4 MiB. The group revision changes the task definition whenever any reconciler configuration changes.

Terraform always emits `sessionOwner`. An omitted value normally resolves to `<group>.<runner-config>`; if that would exceed the runtime's 256-character limit, the module truncates both readable components and appends a deterministic hash.

GitHub credential **values** never enter Terraform configuration, task definitions, or controller-config parameters. Each leaf carries only three Parameter Store names. The task role can read the exact credential parameter ARNs for its group and decrypt only explicitly declared KMS keys.

## Container image

The convenience default is:

```text
ghcr.io/github-aws-runners/terraform-aws-github-runner-scale-set-service:latest
```

ECS `versionConsistency` is enabled so all tasks in a deployment resolve a tag consistently. Production callers should set `container.image` to the digest published with a release:

```hcl
container = {
  image = "ghcr.io/github-aws-runners/terraform-aws-github-runner-scale-set-service@sha256:<release-digest>"
}
```

Public registry images need no pull permission. For a private ECR override, set `container.ecr_repository.arn`; the execution role receives repository-scoped layer permissions plus the unavoidable resource-unscoped `ecr:GetAuthorizationToken` action.

For the official GHCR default, verify an anonymous pull after the first package publish. Package visibility may inherit repository or organization settings and must not be inferred only from a successful authenticated workflow push.

## ECS and security behavior

- A managed ECS cluster is created by default. Set `ecs.cluster.mode = "external"` and pass `ecs.cluster.arn` to reuse a cluster. The mode must be known at plan time; the ARN may be computed.
- Every group gets a separate service, task definition, task role, execution role, log group, and security group.
- `desired_count` is fixed at one. Deployment percentages are `minimum = 0` and `maximum = 100`, preventing old and new tasks from overlapping while session leasing is unavailable.
- The ECS deployment circuit breaker and rollback are enabled.
- Tasks run in supplied private subnets with public IP assignment disabled. Managed security groups have no ingress and allow only TCP/443 egress. The IPv4 Internet default is intended for controlled NAT/firewall paths and can be narrowed.
- The application container runs with a numeric non-root UID/GID, a read-only root filesystem, init enabled, no privilege, and all Linux capabilities dropped.
- ECS probes `/healthz` for liveness, and `container.health_path` accepts only that endpoint. `/readyz` remains an application readiness signal; reconnecting to GitHub should not cause ECS to restart every reconciler in a group.
- CloudWatch encrypts logs at rest with an AWS-owned key by default. Set `logging.kms_key_arn` for a customer-managed key and ensure its key policy allows the regional CloudWatch Logs service.

## Plan-shape requirements

The following values control `for_each`, dynamic IAM statements, or resource ownership and must be known during planning:

- runner-config map keys;
- compute-contract map keys and provider `type`;
- grouping strategy, custom group keys, and membership;
- IAM statement keys and optional KMS/ECR wrapper presence;
- optional ECS ephemeral-storage wrapper presence;
- managed versus external cluster mode.

Inner values such as scale-set IDs, SSM/KMS ARNs, provider configuration values, IAM actions/resources, and an external cluster ARN may be computed. Nullable computed values should be placed inside a plan-known wrapper rather than used as the wrapper itself.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.4.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_aws"></a> [aws](#provider\_aws) | 6.61.0 |
| <a name="provider_terraform"></a> [terraform](#provider\_terraform) | n/a |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [aws_cloudwatch_log_group.controller](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_ecs_cluster.controller](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_cluster) | resource |
| [aws_ecs_service.controller](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_service) | resource |
| [aws_ecs_task_definition.controller](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_task_definition) | resource |
| [aws_iam_role.execution](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.task](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.execution](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.task](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_security_group.controller](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group) | resource |
| [aws_ssm_parameter.reconciler_config](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [terraform_data.validate_config_store](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/resources/data) | resource |
| [terraform_data.validate_contract](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/resources/data) | resource |
| [terraform_data.validate_group_task_policy](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/resources/data) | resource |
| [terraform_data.validate_grouping](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/resources/data) | resource |
| [terraform_data.validate_runtime](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/resources/data) | resource |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_iam_policy_document.execution](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.task](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.task_assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_partition.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/partition) | data source |
| [aws_region.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/region) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_compute_provider_contracts"></a> [compute\_provider\_contracts](#input\_compute\_provider\_contracts) | Provider-neutral, scale-set capability fragments keyed exactly like `runner_configs`.<br/><br/>`type` is the plan-known provider discriminator used by the default grouping implementation and the runtime adapter registry. `configuration_json` is provider-owned, valid JSON and must contain no secrets. `environment_variables` contains non-secret provider process settings shared by every reconciler in the same controller group; conflicting values are rejected. IAM statement map keys and optional condition shapes must be known during planning; their action, resource, and condition values may be computed. | <pre>map(object({<br/>    type = string<br/>    capabilities = object({<br/>      scale_set = object({<br/>        configuration_json    = optional(string, "{}")<br/>        environment_variables = optional(map(string), {})<br/>        iam_statements = optional(map(object({<br/>          actions   = set(string)<br/>          resources = set(string)<br/>          conditions = optional(list(object({<br/>            test     = string<br/>            variable = string<br/>            values   = set(string)<br/>          })), [])<br/>        })), {})<br/>      })<br/>    })<br/>  }))</pre> | n/a | yes |
| <a name="input_config_store"></a> [config\_store](#input\_config\_store) | Non-secret controller configuration storage. The module writes one SSM String parameter per reconciler below `path_prefix/<controller-group>/<runner-config>`. The task receives only its group path and a SHA-256 revision, then loads the group with `GetParametersByPath`.<br/><br/>Standard parameters are limited to 4096 encoded bytes and Advanced parameters to 8192 encoded bytes. Null `path_prefix` resolves to `/<prefix>/scale-set-controller`. | <pre>object({<br/>    path_prefix = optional(string, null)<br/>    tier        = optional(string, "Standard")<br/>    tags        = optional(map(string), {})<br/>  })</pre> | `{}` | no |
| <a name="input_container"></a> [container](#input\_container) | Scale-set controller image and runtime settings. A null image uses the internal official convenience image; production callers should use the release digest. Filesystem and Linux capability hardening are enforced by the module; health\_path is fixed at /healthz, the ECS liveness endpoint. | <pre>object({<br/>    image                             = optional(string, null)<br/>    user                              = optional(string, "10001:10001")<br/>    health_port                       = optional(number, 8080)<br/>    health_path                       = optional(string, "/healthz")<br/>    health_check_command              = optional(list(string), null)<br/>    health_check_interval             = optional(number, 30)<br/>    health_check_timeout              = optional(number, 5)<br/>    health_check_retries              = optional(number, 3)<br/>    health_check_start_period         = optional(number, 30)<br/>    health_stale_after_seconds        = optional(number, 180)<br/>    shutdown_timeout_seconds          = optional(number, 110)<br/>    session_close_timeout_seconds     = optional(number, 10)<br/>    reconnect_initial_backoff_seconds = optional(number, 1)<br/>    reconnect_max_backoff_seconds     = optional(number, 30)<br/>    stop_timeout_seconds              = optional(number, 120)<br/>    ecr_repository = optional(object({<br/>      arn = string<br/>    }), null)<br/>  })</pre> | `{}` | no |
| <a name="input_ecs"></a> [ecs](#input\_ecs) | ECS substrate configuration. A managed cluster is created by default. For an external cluster, set `cluster.mode = "external"` and pass its ARN; the mode must be plan-known while the ARN may be computed. | <pre>object({<br/>    cluster = optional(object({<br/>      mode               = optional(string, "managed")<br/>      arn                = optional(string, null)<br/>      name               = optional(string, null)<br/>      container_insights = optional(bool, true)<br/>    }), {})<br/>    task = optional(object({<br/>      cpu              = optional(number, 512)<br/>      memory           = optional(number, 1024)<br/>      cpu_architecture = optional(string, "X86_64")<br/>      ephemeral_storage = optional(object({<br/>        size_in_gib = number<br/>      }), null)<br/>    }), {})<br/>    service = optional(object({<br/>      platform_version = optional(string, "LATEST")<br/>    }), {})<br/>    iam = optional(object({<br/>      path                 = optional(string, "/")<br/>      permissions_boundary = optional(string, null)<br/>    }), {})<br/>  })</pre> | `{}` | no |
| <a name="input_grouping"></a> [grouping](#input\_grouping) | Packing strategy for scale-set reconcilers. `compute_provider` creates one controller group per compute-provider type and is the default. `runner_config` creates one group per runner config. `custom` uses `custom.groups`; custom membership must cover every runner config exactly once.<br/><br/>The strategy, custom group keys, and memberships select Terraform `for_each` instances and must be known during planning. | <pre>object({<br/>    strategy = optional(string, "compute_provider")<br/>    custom = optional(object({<br/>      groups = map(object({<br/>        runner_configs = set(string)<br/>      }))<br/>    }), null)<br/>  })</pre> | `{}` | no |
| <a name="input_logging"></a> [logging](#input\_logging) | CloudWatch Logs configuration. CloudWatch encrypts logs at rest with an AWS-owned key by default; set `kms_key_arn` to use a customer-managed key. | <pre>object({<br/>    retention_in_days = optional(number, 30)<br/>    kms_key_arn       = optional(string, null)<br/>    log_group_class   = optional(string, "STANDARD")<br/>    tags              = optional(map(string), {})<br/>  })</pre> | `{}` | no |
| <a name="input_network"></a> [network](#input\_network) | Private Fargate networking. Tasks never receive public IP addresses and the managed security groups have no ingress. HTTPS egress defaults to IPv4 Internet access because GitHub endpoints cannot be represented as security-group destinations; route it through controlled NAT, firewall, or proxy infrastructure when required. | <pre>object({<br/>    vpc_id     = string<br/>    subnet_ids = set(string)<br/>    https_egress = optional(object({<br/>      ipv4_cidrs = optional(set(string), ["0.0.0.0/0"])<br/>      ipv6_cidrs = optional(set(string), [])<br/>    }), {})<br/>  })</pre> | n/a | yes |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | Stable prefix used for scale-set controller resources. | `string` | `"github-actions"` | no |
| <a name="input_runner_configs"></a> [runner\_configs](#input\_runner\_configs) | Normalized scale-set runner configurations keyed by stable runner-config name.<br/><br/>Map keys must be known during planning. Credential values are never accepted: `github.app` contains only the exact GitHub App Parameter Store references used by the runtime. `github.ssl_verify` applies TLS verification per reconciler without changing process-global TLS behavior. Parameter and optional KMS ARNs, scale-set IDs, and other inner values may remain unknown until apply. | <pre>map(object({<br/>    github = object({<br/>      config_url = string<br/>      app = object({<br/>        app_id = object({<br/>          name        = string<br/>          arn         = string<br/>          kms_key_arn = optional(string, null)<br/>        })<br/>        private_key = object({<br/>          name        = string<br/>          arn         = string<br/>          kms_key_arn = optional(string, null)<br/>        })<br/>        installation_id = object({<br/>          name        = string<br/>          arn         = string<br/>          kms_key_arn = optional(string, null)<br/>        })<br/>      })<br/>      force_ghes = optional(bool, null)<br/>      ssl_verify = optional(bool, true)<br/>      user_agent = optional(string, null)<br/>    })<br/>    scale_set = object({<br/>      name                 = string<br/>      id                   = number<br/>      runner_group_id      = optional(number, null)<br/>      min_runners          = optional(number, 0)<br/>      max_runners          = optional(number, 10)<br/>      boot_time_in_minutes = optional(number, 10)<br/>      session_owner        = optional(string, null)<br/>    })<br/>    work_folder = optional(string, null)<br/>  }))</pre> | n/a | yes |
| <a name="input_tags"></a> [tags](#input\_tags) | Tags applied to scale-set orchestration resources. | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_cluster"></a> [cluster](#output\_cluster) | Managed or external ECS cluster selected for all controller groups. |
| <a name="output_controller_groups"></a> [controller\_groups](#output\_controller\_groups) | Controller-group resources keyed by stable resolved group name. |
| <a name="output_reconciler_config_parameters"></a> [reconciler\_config\_parameters](#output\_reconciler\_config\_parameters) | Non-secret SSM controller configuration parameters keyed by `<controller-group>/<runner-config>`. Values are intentionally not exposed. |
| <a name="output_resolved_container_image"></a> [resolved\_container\_image](#output\_resolved\_container\_image) | Container image reference selected for the controller task definitions. |
<!-- END_TF_DOCS -->
