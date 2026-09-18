# ADR-0002: Runner Storage Provider Boundary

## Status

Proposed

## Date

2026-09-08

## Context

Runner operation depends on several kinds of stored data: GitHub App
credentials, webhook secrets, matcher configuration, runner-group mappings,
short-lived runner bootstrap configuration, and runner lifecycle state. The
original implementation stored these values in AWS Systems Manager Parameter
Store (SSM), with parameter names, SecureString handling, cleanup, and IAM
permissions spread across the Lambda and Terraform modules.

That coupling makes it difficult to provide durable runner inventory and to
change the storage implementation without adding provider-specific branches to
each consumer. It also makes the control plane rely on provider discovery for
runner counts, which is insufficient while a runner is being provisioned or
when a launch succeeds before the rest of its registration flow completes.

The repository needs a replaceable storage boundary that preserves existing
SSM deployments while allowing an opt-in DynamoDB implementation for the
provider-boundary multi-runner configuration.

## Decision

Define provider-neutral storage interfaces for the data used by runner
orchestration and select one storage provider for a deployment. The supported
providers are:

- `aws_ssm`: the existing default and compatibility path.
- `aws_dynamodb`: the durable, opt-in path for provider-boundary
  multi-runner configurations.

Provider selection is represented by the canonical values `aws_ssm` and
`aws_dynamodb`. An omitted selection resolves to `aws_ssm`. A deployment must
select at most one provider; storage consumers do not silently fall back from
one provider to the other when a credential, permission, or data lookup fails.

### Provider-neutral contract

The storage library owns interfaces and provider factories for:

- GitHub App credentials;
- webhook secrets;
- runner matcher configuration;
- runner configuration creation and one-time consumption;
- runner-group ID caching; and
- runner lifecycle state.

Control-plane and bootstrap code depends on these interfaces. It does not
construct SSM parameter names or DynamoDB keys. Provider-specific factories are
selected once per Lambda process from the environment and are safe to reuse
within that process.

Runner bootstrap configuration remains separate from lifecycle state. Bootstrap
configuration contains short-lived or sensitive values and is consumed once;
runner state is durable inventory keyed by the compute resource and records
states such as `provisioning`, `active`, `orphan`, and `terminating`.

### SSM provider

The SSM provider retains the established behavior for existing deployments:

- parameters remain the storage boundary for credentials, secrets, matcher
  configuration, runner groups, and runner bootstrap configuration;
- sensitive values use SecureString parameters and existing parameter-store
  tagging conventions;
- runner configuration cleanup remains an explicit housekeeper operation; and
- existing stable Terraform inputs continue to translate to the SSM provider.

SSM does not provide the durable runner-state implementation in this phase.
When state inventory is unavailable, the control plane uses compute-provider
discovery, preserving the existing behavior.

### DynamoDB provider

The DynamoDB provider uses two shared tables:

1. a configuration table for global records and per-runner-entry records; and
2. a runner-state table for durable lifecycle inventory with TTL-based cleanup.

Records use explicit logical scopes and an `id` so that global data, entry
configuration, runner-group mappings, bootstrap values, and runner state cannot
collide. The provider exposes table names, scopes, TTL settings, and IAM policy
fragments as Terraform capabilities rather than making callers know the table
layout.

The DynamoDB implementation must enforce the storage contract at the data
operation boundary:

- one-time bootstrap consumption is conditional and removes the consumed
  record;
- lifecycle transitions are conditional so stale workers cannot overwrite a
  newer state;
- runner-state records identify the compute provider, compute resource, GitHub
  identity when known, owner, runner type, and lifecycle state; and
- IAM policies restrict access with table ARNs and DynamoDB leading-key
  conditions. Runner bootstrap access is restricted to the matching compute
  resource identity.

### Terraform capability boundary

Terraform resolves the selected provider once and passes opaque capabilities to
the webhook orchestration and compute-provider modules. Capabilities include
provider-specific environment variables and IAM policy documents for each
consumer, including the runner bootstrap path.

The `global_config_storage_provider` input selects the provider for the
provider-boundary configuration. Stable v1 configuration is translated to an
SSM selection, so existing users retain the current backend unless they opt in
to DynamoDB through the provider-boundary configuration.

The compute provider owns the runner-side capability needed to read bootstrap
configuration. The orchestration provider owns its Lambda resources and
receives only the capabilities it needs. This keeps storage ownership separate
from both compute implementation and orchestration scheduling.

## Alternatives considered

### Keep SSM as the only backend

This preserves the smallest implementation, but does not provide durable
runner inventory or a suitable shared store for the provider-boundary design.

### Add storage conditionals to every consumer

This would avoid a factory layer initially, but it would duplicate key
construction, error handling, security rules, and migration behavior across
Lambdas and runner bootstrap code. It would make each new provider more
expensive and easier to implement inconsistently.

### Use one DynamoDB table for all data

One table could reduce resource count, but separating configuration from
ephemeral runner state gives the two lifecycles independent TTL, protection,
and access policies. The two-table design also makes accidental access to
runner state from configuration consumers less likely.

### Migrate existing SSM data automatically

Automatic migration would require dual writes or a cutover protocol and could
duplicate or lose short-lived bootstrap configuration. Migration is therefore
an explicit operational decision outside provider selection; the default
remains backward compatible with SSM.

## Consequences

### Positive

- Existing stable deployments continue to use SSM without configuration
  changes.
- Storage consumers share one provider-neutral contract and do not duplicate
  backend logic.
- DynamoDB can provide durable runner inventory and conservative recovery from
  launch-before-registration failures.
- Provider-specific IAM conditions and runner bootstrap capabilities can be
  reviewed at the Terraform module boundary.
- A future storage provider can implement the same interfaces without changing
  orchestration or compute-provider callers.

### Negative

- The DynamoDB path adds two tables, TTL behavior, conditional-write logic,
  provider-specific IAM, and additional operational cost.
- SSM and DynamoDB have different consistency, cleanup, and failure behavior;
  both implementations require provider-specific contract tests.
- Switching an existing deployment does not migrate stored values or active
  runner inventory automatically.
- The control plane must retain compute discovery as a recovery source even
  when DynamoDB inventory is enabled.

## Migration and operational rules

1. Keep `aws_ssm` as the default until a deployment explicitly selects
   `aws_dynamodb`.
2. Treat a provider switch as an operational migration with a planned cutover;
   do not assume existing SSM records are present in DynamoDB.
3. Keep provider-specific secrets, table names, scopes, and IAM details inside
   provider capabilities and environment configuration, not in shared
   orchestration code.
4. Add contract tests for every new provider covering reads, writes,
   one-time consumption, conditional lifecycle transitions, and authorization
   boundaries.

## References

- [Storage-provider interfaces and factories](../../lambdas/libs/storage-providers/)
- [DynamoDB storage-provider module](../../modules/storage-providers/aws/dynamodb/)
- [Multi-runner storage-provider composition](../../modules/multi-runner/storage-provider.tf)
- [Compute-provider storage capability contract](../../modules/compute-providers/aws/ec2/variables.tf)
