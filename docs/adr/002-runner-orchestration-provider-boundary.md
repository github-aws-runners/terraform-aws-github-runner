# ADR-002: Runner Orchestration Provider Boundary

## Status

Proposed

## Date

2026-08-15

## Context

Before this change, the multi-runner module received workflow-job demand through a shared GitHub webhook. A build queue invoked scale-up, schedules invoked scale-down and the runner pool, and a retry queue invoked queued-job checks. Those components evolved together and their settings were spread across shared module inputs and each runner config.

That layout assumes every runner config uses the same demand-control model. It also makes the runner-config module responsible for webhook-specific resources. Adding another model would require provider conditionals throughout the module or a second copy of the common runner and compute-provider wiring.

GitHub Actions Runner Scale Sets require a different control model. The scale-set implementation uses the runner scale-set and agent APIs, including:

- `_apis/runtime/runnerscalesets`
- `_apis/distributedtask/pools/0/agents`

Unlike the event- and schedule-driven Lambda components, a scale-set controller maintains reconciliation state and long-lived coordination with GitHub. It therefore runs as a containerized ECS/Fargate service rather than another independent Lambda handler.

The Terraform contract must support both models without moving webhook fields a second time or creating one controller service per runner config. This ADR defines the boundary and the initial scale-set integration: the API client, one controller process with multiple reconcilers, container packaging, ECS resources, and EC2 compute capability. Automatic scale-set discovery or creation, multi-task leader election, and horizontal controller scaling remain outside this decision.

## Terminology

- **Runner config**: One entry in `experimental.multi_runner_config`, including common runner behavior, one orchestration provider, and one compute provider.
- **Orchestration provider**: The implementation that receives or reconciles runner demand and owns the control components needed to turn that demand into capacity actions.
- **Compute provider**: The implementation that creates and manages runner capacity, such as EC2. It supplies capabilities to the selected orchestration provider.
- **Webhook orchestration**: The existing webhook, queue, scale-up, scale-down, pool, and job-retry implementation.
- **Scale-set orchestration**: The stateful controller built on GitHub's runner scale-set APIs and deployed in controller groups.

This ADR uses “runner config” for the concept and `runner-config` for the module.

## Decision

We will use typed orchestration-provider and compute-provider boundaries in the experimental multi-runner v2 interface. Every runner config selects exactly one provider of each type.

### Provider selection is per runner config

Every experimental runner config must contain an `orchestration_provider` object with exactly one non-null typed provider block. The supported blocks are `webhook` and `scale_set`:

```hcl
experimental = {
  multi_runner_config = {
    linux_arm64 = {
      orchestration_provider = {
        webhook = {
          runner = {
            boot_time_in_minutes = 5
            ephemeral            = true
            jit_config_enabled   = null
            maximum_count        = 4
          }

          github = {
            organization_runners = true
          }

          matcherConfig = {
            labelMatchers = [["linux", "arm64"]]
          }
        }
      }

      compute_provider = {
        aws = {
          ec2 = {
            instance_types = ["m7g.large"]
          }
        }
      }
    }
  }
}
```

Selection is based on the populated provider block, not on a string discriminator. The wrapper's nullness and any value that controls resource shape must be known during planning. Other values inside the selected provider may remain unknown until apply.

Validation counts non-null provider blocks rather than naming one special case. Another provider can therefore be added as a sibling without changing the selection rule. Different runner configs may select webhook and scale-set orchestration in the same deployment, but one runner config cannot combine providers.

Scale-set selection owns GitHub scope and installation identity, existing scale-set identity, desired capacity, boot timeout, and optional session/work-folder settings. The [runner scale-set controller guide](../scale-set.md) documents the experimental input contract and operating model.

### Global orchestration blocks provide defaults; they do not select providers

`experimental.orchestration_provider.webhook` is the global defaults and shared-component namespace for webhook orchestration. `experimental.orchestration_provider.scale_set` is the global shared-controller namespace for scale-set orchestration. Neither block selects a provider for a runner config. Selection remains under `experimental.multi_runner_config.<runner_config>.orchestration_provider`.

The webhook global namespace owns:

- the default runner boot timeout used by webhook scale-down and pool components;
- the default ephemeral and just-in-time registration lifecycle used by webhook controls and runner bootstrap;
- the default maximum runner count enforced by webhook scale-up and pool components;
- the repository allow list enforced by the shared webhook;
- queue-selection strategy, EventBridge routing, and matcher-parameter tier;
- build-queue defaults, redrive behavior, tags, and encryption;
- the shared webhook Lambda configuration and artifact selection;
- the runner-control artifact shared by scale, pool, and job-retry; and
- default scale-up, scale-down, and pool component settings.

Job-retry remains a per-runner-config webhook setting in this phase; its
typed block supplies its own defaults rather than inheriting a global block.

Runner boot time, ephemeral mode, JIT configuration, and maximum runner count are webhook-provider settings rather than common runner identity. Their canonical paths live under `experimental.orchestration_provider.webhook.runner`, with matching paths under `experimental.multi_runner_config.<runner_config>.orchestration_provider.webhook.runner` for runner-config overrides. Stable-v1 translation maps the existing lifecycle, boot-time, and capacity inputs into those provider paths, and the unchanged stable `modules/runners` call reads from the canonical provider block. No compatibility aliases are retained under the experimental common `runner` object. The webhook provider resolves a null JIT setting to the effective ephemeral mode, exposes that lifecycle contract to runner-config bootstrap, injects boot time into scale-down and pool, and keeps these settings out of compute-provider capabilities.

The common `experimental.github` block continues to own credentials and GitHub API client settings shared across implementations, including `enterprise_server` and `user_agent`. Repository filtering belongs to the shared webhook at `experimental.orchestration_provider.webhook.github.repository_white_list`; per-runner-config `organization_runners` remains in the same provider-owned GitHub block.

The common `experimental.lambda` block contains only provider-neutral Lambda substrate: runtime, architecture, networking, role settings, additional principals, tags, and an optional shared artifact bucket. It does not select a provider archive. Each component owner supplies its own local zip or S3 object key and version.

The webhook provider owns one runner-control artifact at `orchestration_provider.webhook.lambda.artifact`, shared by scale, pool, and job-retry. Its `lambda.scale` child contains only `up` and `down` configuration, while the ingress webhook retains its separate `lambda.webhook.artifact`. The provider-neutral SSM housekeeper owns its artifact selector under `ssm.housekeeper.lambda.artifact`. A runner-config selection overrides the global `experimental.ssm.housekeeper.lambda.artifact`; an S3 selection combines its key and optional object version with the common Lambda artifact bucket, a zip selection uses its local path, and no selection uses runner-config's packaged runner control-plane archive. This selector is independent of the webhook runner-control artifact. Stable-v1 translation maps the existing runner artifact into both canonical component contracts so the translated representation remains complete without changing the stable resource path.

For a selected webhook provider, resolution follows:

```text
runner-config override > experimental.orchestration_provider.webhook default
```

Tag maps merge from broad to narrow. A runner-config override affects only that runner config; it does not configure a shared singleton.

The global scale-set namespace owns controller grouping, container settings, non-secret manifest storage, ECS cluster/task/service/IAM settings, private task networking, logging, and controller resource tags. Per-runner scale-set settings are not global defaults: each scope, installation ID, scale-set identity, capacity range, and boot timeout belongs to exactly one runner config. Scale-set orchestration uses only the primary App ID and private-key Parameter Store references derived from `experimental.github.app`; it does not select an entry from `experimental.github.additional_apps`. Each runner config supplies its own installation-ID reference because the primary App can have installations in multiple GitHub scopes.

`modules/multi-runner` filters scale-set selections, gathers their exact-keyed compute-provider capabilities, and calls `modules/orchestration-providers/scale-set` once. The provider resolves controller groups using `compute_provider`, `runner_config`, or explicit `custom` grouping. Each group owns one ECS service, one task definition, one normally running task, one controller process, and multiple reconcilers. Runner-config does not instantiate a scale-set controller per runner config.

### Module ownership follows the provider boundary

The Terraform implementation is split as follows:

| Layer | Responsibility |
| --- | --- |
| `modules/multi-runner` | Selects stable or experimental mode, resolves global and runner-config values, owns shared webhook ingress and build queues, routes typed provider objects, and makes the one aggregated scale-set provider call. |
| `modules/runner-config` | Composes provider-neutral runner resources, selects exactly one orchestration provider and one compute provider, creates or selects the runner role, and connects provider capabilities. |
| `modules/orchestration-providers/webhook` | Owns webhook orchestration composition, provider defaults, tag layering, and the scale, pool, and retry leaf modules. |
| `modules/orchestration-providers/webhook/scale-runners` | Owns the scale-up and scale-down Lambdas, schedules, queue integration, IAM, and outputs. |
| `modules/orchestration-providers/webhook/pool` | Owns optional scheduled pool resources and IAM. |
| `modules/orchestration-providers/webhook/job-retry` | Owns optional queued-job retry resources and IAM. |
| `modules/orchestration-providers/scale-set` | Aggregates selected scale-set runner configs and compute capabilities, resolves controller groups, stores non-secret reconciler manifests, and owns ECS/Fargate, task IAM, networking, health checks, and logging. |
| `modules/runner-config/ssm-housekeeper` | Owns provider-neutral cleanup of runner token and configuration parameters, including its component-specific Lambda artifact. |
| `modules/compute-providers/<namespace>/<provider>/trust-policy` | Produces the provider-specific runner-role trust policy before the common runner role is resolved. |
| `modules/compute-providers/<namespace>/<provider>` | Owns capacity resources and returns policy, environment-variable, managed-policy, and resource capabilities. |

The former `modules/runner-stack` name becomes `modules/runner-config`. “Runner config” describes the module's purpose without implying a specific deployment topology.

```mermaid
flowchart TD
  Multi["multi-runner: normalize and route"] --> Config["runner-config: compose one runner config"]
  Config --> Selector{"exactly one orchestration provider"}
  Selector --> Webhook["orchestration-providers/webhook"]
  Selector --> Marker["scale-set selection and fixed JIT lifecycle"]
  Config --> ComputeSelector{"exactly one compute provider"}
  ComputeSelector --> Trust["compute-providers/aws/ec2/trust-policy"]
  Trust --> Role["runner role"]
  Role --> EC2["compute-providers/aws/ec2"]
  EC2 --> Capabilities["compute capabilities"]
  Capabilities --> Webhook
  Capabilities --> Aggregate["multi-runner: exact-keyed scale-set aggregate"]
  Marker --> Aggregate
  Aggregate --> ScaleSet["one orchestration-providers/scale-set call"]
  ScaleSet --> Groups["N controller groups"]
  Groups --> Reconcilers["one service/task/controller and N reconcilers per group"]
  Webhook --> Scale["scale-runners"]
  Webhook --> Pool["pool"]
  Webhook --> Retry["job-retry"]
```

Provider leaf modules live below `modules/orchestration-providers/webhook`, not below `modules/runner-config`. This keeps the composition module small and prevents provider-owned resources from becoming a permanent part of the common contract.

### Compute providers expose capabilities, not orchestration resources

The selected compute provider remains independent from the selected orchestration provider. Its trust-policy submodule supplies the runner-role trust document before the common role is resolved. The full compute provider then returns policy documents, environment variables, managed-policy references, and resources needed by orchestration components.

`runner-config` adapts the legacy policy and environment fragments into the scale-up, scale-down, and pool capabilities consumed by webhook orchestration. It also exposes the selected provider's typed orchestration capabilities to multi-runner. For scale-set orchestration, EC2 returns provider-owned, non-secret runtime JSON plus environment and IAM fragments; GitHub scope, credentials, desired capacity, and boot timeout remain orchestration-owned. The webhook provider owns its Lambda roles, and the scale-set provider owns controller task roles. The compute provider creates neither orchestration resource.

This direction keeps the dependency graph one-way:

```text
runner-config -> compute provider -> capability contract -> runner-config adapter -> orchestration provider
```

Each additional orchestration capability belongs at the compute-provider boundary; it must not add provider conditionals to unrelated orchestration leaves.

### Compatibility and state are explicit

Stable inputs are translated into the same internal canonical representation so defaults and shared singleton values have one resolution path. Stable runner configs continue to call the existing `modules/runners` implementation at their existing addresses. Opting into experimental v2 is module-wide: a non-empty `experimental.multi_runner_config` replaces, rather than merges with, the stable map.

Concrete provider modules use explicitly named, count-addressed labels. Compute modules follow `module.compute_<namespace>_<type>[0]`, while orchestration modules follow `module.orchestration_<type>[0]`. The AWS EC2 modules therefore use `module.compute_aws_ec2_trust_policy[0]` and `module.compute_aws_ec2[0]` inside runner-config; multi-runner uses `module.orchestration_scale_set[0]` for the cross-runner aggregate.

Declarative moved blocks preserve existing experimental state for the AWS namespace rename: `module.compute_ec2_trust_policy[0]` moves to `module.compute_aws_ec2_trust_policy[0]`, and `module.compute_ec2[0]` moves to `module.compute_aws_ec2[0]`. These moves are scoped to those v2 child modules; unrelated earlier experimental addresses remain outside the stable contract and require explicit migration when affected.

The canonical v2 output groups per-runner webhook resources under `orchestration_provider.webhook`, represents scale-set selection under `orchestration_provider.scale_set`, and keeps compute resources under the selected namespace and provider, currently `provider.aws.ec2`. Direct `scale_up`, `scale_down`, and `pool` outputs remain compatibility aliases and are null for scale-set runner configs. Grouped controller resources are exposed separately through the top-level `scale_set` output. No moved blocks are added for the new experimental scale-set path. Moved blocks preserve earlier compute state addresses but cannot rewrite configuration expressions, so consumers must update references from the former experimental `provider.ec2` path.

This ADR does not define an automatic stable-v1-to-v2 state migration. Existing deployments remain on the stable path until that migration is separately designed and documented.

### Semantic validation lives beside module composition

Internal runner-config, orchestration-provider, and compute-provider modules keep nested variable declarations focused on types, defaults, and documentation. A module with semantic or cross-field checks declares one or more input-free `terraform_data` validation resources in `validations.tf`. These resources have no `input` or `triggers_replace`, so configuration values are not copied into state and ordinary value changes do not replace them.

This convention requires Terraform 1.4 or newer and adds state-only objects where an internal module needs semantic validation. Known invalid values still fail during planning; unknown conditions may defer until apply, and targeted plans can omit a detached validation resource. Direct module tests therefore target and assert the relevant validation resource explicitly.

### Existing shared modules stay unchanged

The orchestration-provider boundary does not change the public contracts or resource addresses of `modules/webhook` or `modules/ssm`.

The shared webhook remains at its existing unconditional module address. The shared SSM module continues to create or reference the webhook secret even when no runner config selects webhook orchestration. That singleton contract may support other uses and is independent of the per-runner exact-one provider selection.

Any later proposal to make those shared modules conditional is a separate compatibility and state decision.

### Scale-set integration and deferred capabilities

The v2 type publishes `scale_set` as a sibling of `webhook`. The runtime opens GitHub message sessions, reconciles one or more existing scale sets, stores no credential values in manifests, and delegates runner lifecycle operations through typed compute-provider adapters. Terraform deploys one service per resolved controller group with desired count one.

The provider adopts existing GitHub scale sets and deliberately does not discover, create, or delete them. Callers supply the scale-set name and ID plus a Parameter Store reference for the installation ID. The canonical GitHub scope and numeric scale-set ID form the ownership key. Terraform rejects duplicate keys within one module instance, and operators must keep the same key unique across deployments because separate Terraform states cannot detect competing controllers.

Scale-set-created EC2 instances carry `ghr:created_by=scale-set-service`, and their reconciler owns GitHub deregistration and compute termination. The unchanged shared termination watcher can match the same environment, so a module instance containing scale-set runner configs rejects watcher-based runner deregistration. The watcher may remain enabled as a logging and metrics observer. Horizontal task scaling, leader election, automatic failover between controller tasks, and provider-independent persistent reconciliation state require a later decision. Until then, ECS restarts the single desired task and each controller uses its stable session-owner contract to reconnect.

Webhook and scale-set orchestration can coexist in one multi-runner module instance when different runner configs select them. They cannot both own the same runner config, and scale-set selections do not receive webhook build queues or matcher entries.

## Consequences

### Positive

- Additional orchestration providers become sibling modules instead of cross-cutting conditionals.
- Common runner settings and compute-provider configuration remain reusable across demand-control models.
- Provider-owned queue, Lambda, artifact, IAM, and output settings have one discoverable namespace.
- Exact-one validation prevents ambiguous ownership of a runner config.
- Stable behavior and shared singleton addresses remain unchanged.
- Provider module addresses follow one consistent compute and orchestration naming convention.

### Negative

- The experimental input is more deeply nested than the existing flat interface.
- Global webhook defaults and per-runner webhook selection use similarly named blocks with different purposes.
- Internal modules have explicit adapter objects and capability contracts that require maintenance.
- Module-level validation resources add state-only objects and are not evaluated by a targeted plan that excludes them.
- The initial scale-set provider runs one task per group; horizontal high availability still requires leader election or an external ownership protocol.
- Compatibility aliases temporarily expose both canonical and historical v2 output paths.

## Alternatives Considered

### Add a flat orchestration mode string

A value such as `orchestration_type = "webhook"` plus a flat collection of settings would make unrelated fields valid for every provider and require cross-field validation.

**Decision**: Use typed, nullable sibling blocks. The populated block both selects and configures the provider.

### Put provider conditionals directly in `runner-config`

This would keep fewer directories initially, but every provider would add resources, variables, IAM branches, and outputs to the common module.

**Decision**: Keep `runner-config` as a selector and composer. Put concrete resources under `modules/orchestration-providers/<provider>`.

### Keep webhook leaves under `runner-config`

Scale, pool, and retry are all webhook orchestration behavior. Leaving them under the common module would blur ownership and make a future provider appear to support components it does not use.

**Decision**: Move the leaves under the webhook provider root. Earlier experimental addresses are not retained as an in-module state-migration contract.

### Create one ECS service per runner config

This gives every reconciler independent deployment and failure isolation, but creates excessive services, task definitions, roles, and idle tasks for large installations.

**Decision**: Create one service per resolved controller group. Default grouping packs runner configs by compute-provider type; callers can choose per-runner or explicit custom grouping.

### Make the shared webhook and webhook secret conditional

That change would alter existing singleton resource addresses and would conflate module-level ingress with per-runner provider selection.

**Decision**: Leave `modules/webhook` and `modules/ssm` unchanged in this refactor.

## Migration and Verification

Implementation and review must verify the boundary at several levels.

### Terraform contract tests

- Runner configs with exactly one webhook or scale-set provider plan successfully.
- Zero or multiple selected orchestration providers fail the same focused validation rule.
- Provider-wrapper nullness and other graph-shaping values must be plan-known; non-shaping values inside the selected provider may remain unknown until apply.
- Per-runner values override global webhook defaults, and omitted nullable values inherit them.
- Shared singleton resources consume global values rather than arbitrary per-runner overrides.
- Stable inputs preserve stable resource addresses and output shape.
- Fresh plans use the canonical `module.compute_aws_ec2_trust_policy[0]` and `module.compute_aws_ec2[0]` runner-config addresses, with declarative moved blocks mapping the prior v2 child labels.
- Canonical nested outputs and compatibility aliases reference the same resources.
- Webhook and scale-set runner configs coexist, scale-set-only deployments retain the unconditional shared ingress, and only webhook selections create build queues and matcher entries.
- Default and custom grouping create one aggregated scale-set provider call with exact-keyed runner and compute-capability maps.
- Duplicate canonical GitHub scope and scale-set ID tuples fail within one module instance.

### Provider integration tests

- `runner-config` routes only the selected orchestration provider.
- The webhook root composes scale, pool, and retry leaves with the resolved values supplied by `multi-runner`; it does not invent fallback ARNs or empty resource objects.
- Compute-provider capability fragments reach the correct webhook component.
- Scale-set compute capabilities reach the matching reconciler manifest and task IAM policy without GitHub credentials, scope, desired capacity, or boot timeout entering compute-provider JSON.
- A module instance containing scale-set runner configs rejects termination-watcher runner deregistration while permitting metrics-only watcher operation.
- Existing shared queue-policy and compute-provider IAM behavior remains unchanged by this refactor.

### Compatibility checks

- Existing `modules/webhook` and `modules/ssm` public contracts and resource addresses remain unchanged by the provider boundary.
- Stable multi-runner tests continue to pass.
- Experimental provider-routing, computed-input, runner-config, webhook-provider, scale, pool, retry, SSM-housekeeper, EC2-provider, and EC2 trust-policy tests pass.
- Terraform formatting, documentation generation, and repository pre-commit checks are clean.

Before an existing experimental deployment adopts the module rename, operators must migrate affected state explicitly and confirm that the resulting plan contains no unintended replacement actions. Stable deployments must not enable v2 until a stable-to-v2 migration procedure exists.

## References

- [Experimental orchestration- and compute-provider refactor](../modules/internal/compute-provider-refactor.md)
- [Runner scale-set controller](../scale-set.md)
- [GitHub Actions Runner Scale Set client](https://github.com/actions/scaleset)
