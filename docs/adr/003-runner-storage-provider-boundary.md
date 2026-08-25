# ADR-003: Runner Storage Provider Boundary

## Status

Proposed

## Date

2026-08-24

## Context

The runner control plane uses AWS Systems Manager Parameter Store for several
unrelated purposes:

- durable GitHub App credentials and webhook secrets;
- durable webhook matcher and runner configuration;
- short-lived registration tokens and just-in-time runner configuration;
- a rebuildable runner-group ID cache;
- compute-provider-specific values such as an EC2 AMI ID; and
- EC2 Systems Manager access, which is not a storage concern.

Treating all of these uses as one generic key/value provider would erase their
different confidentiality, ownership, retention, consistency, and cleanup
requirements. It would also make a future backend inherit operations that it
does not need. For example, a runner-bootstrap backend must write a sensitive
payload for one runner, while the runner-group cache stores a non-secret value
that can be rebuilt from GitHub.

The existing control-plane implementation calls the shared SSM utility
directly for both runtime-created runner payloads and runner-group cache
entries. That couples orchestration logic to Parameter Store and its write-rate
behavior.

## Decision

Storage is divided by usage capability. This change introduces two initial
contracts:

- `RunnerBootstrapStore` writes the short-lived, sensitive registration or JIT
  payload consumed by one runner.
- `RunnerGroupCacheStore` reads and writes the rebuildable GitHub runner-group
  ID cache.

The contracts expose only the operations needed by their consumers. They do
not expose a generic `get`, `put`, or `delete` API shared across all storage
uses. Provider implementations own backend-specific path construction,
serialization, encryption selection, tags, throughput guidance, SDK calls, and
errors.

The first registered implementation is `aws_ssm`. Scale-up and pool select it
independently through
`RUNNER_BOOTSTRAP_STORAGE_PROVIDER_TYPE` and
`RUNNER_GROUP_CACHE_STORAGE_PROVIDER_TYPE`. Independent selection prevents a
future cache or bootstrap migration from silently moving both data classes.

The SSM implementation preserves the existing behavior:

- runner payloads remain `SecureString` parameters at
  `<token path>/<runner ID>`;
- runner-group IDs remain `String` parameters at
  `<config path>/runner-group/<group name>`;
- the existing parameter tags and per-runner metadata tags are preserved; and
- the existing SSM write-rate guidance continues to pace burst writes.

No Terraform-managed SSM resource, resource address, path, IAM policy, KMS
behavior, runner bootstrap reader, or housekeeper is moved by this decision.
The stable and experimental Terraform paths only add explicit provider
selection to the existing Lambda environments.

### Package ownership

The runtime implementation is organized as follows:

```text
lambdas/libs/storage-providers/
├── core/             # usage contracts and provider registry
├── provider-types.ts # supported provider identifiers and default resolution
└── aws/ssm.ts        # Parameter Store implementation
```

Shared orchestration consumes the usage contracts. The SSM package owns calls
to `aws-ssm-util`; compute- and orchestration-provider packages do not acquire
new SSM parsing or IAM behavior.

### Deferred storage uses

The following SSM uses remain unchanged and are deliberately not forced behind
the initial contracts:

- GitHub credentials and webhook secrets need a secret-resolution contract.
- Matcher configuration, persistent runner configuration, and controller
  manifests need owner-specific durable configuration contracts.
- EC2 AMI Parameter Store resolution remains compute-provider-specific because
  EC2 consumes the SSM reference directly.
- Systems Manager access to runner instances remains an EC2 capability rather
  than a storage provider.
- Reading and deleting the bootstrap payload remains in the existing runner
  bootstrap implementation until that protocol can be migrated without
  changing images or runtime compatibility.

A later backend, including DynamoDB, must implement and test only the usage
capabilities it supports. It must not broaden these contracts into an
unrestricted storage API.

## Consequences

### Positive

- Runtime-created runner payloads and rebuildable cache entries have separate,
  testable semantics.
- Existing SSM resources and operational behavior remain stable.
- A later backend can be introduced for one usage without changing unrelated
  credentials, configuration, or compute-provider behavior.
- Sensitive runner payloads remain encrypted and are not added to logs or
  provider configuration.

### Negative

- The initial provider boundary covers only the control-plane writer and cache;
  runner-side consumption is still SSM-specific.
- Two provider selectors are more verbose than one global storage selector.
- Additional usage contracts will be needed before other SSM responsibilities
  can migrate.
