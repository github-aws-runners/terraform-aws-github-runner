# ADR-003: Scale-set Resource Ownership

## Status

Accepted

## Date

2026-09-23

## Context

GitHub Actions runner scale sets are GitHub-side resources with their own
identity and permissions. The TypeScript controller is the component that
configures GitHub through the scale-set API. Terraform only provisions the
AWS controller substrate and supplies the controller with names and secret
references; Terraform never configures the GitHub scale set itself.

The controller resolves and manages the runtime relationship with a scale set
and runner group from the configured GitHub scope and names. The GitHub API
lifecycle is controller-owned at runtime, not implemented by Terraform.

## Decision

The scale-set orchestration provider resolves GitHub scale sets by name.

- `scale_set.name` identifies the GitHub scale set to reconcile.
- `runner.group_name` identifies the runner group used when the scale set is
  resolved by name.
- Terraform creates and manages the ECS controller, IAM roles, networking,
  logs, and SSM configuration required to run the reconciler. It never calls
  the GitHub scale-set API.
- The controller may discover the scale-set and runner-group IDs at runtime,
  but it does not write those discovered IDs back to SSM. Operators may
  pre-populate optional cache parameters when they want read-side caching.
- If the named scale set is absent, the controller may register it in the
  resolved runner group and reconcile its system labels. It does not delete
  scale sets.
- The controller currently registers a missing scale set and reconciles its
  system labels. Terraform destroy removes the AWS controller and stops future
  reconciliation, but it cannot delete or rename the GitHub resources because
  Terraform never configures them.

The configured GitHub scope and scale-set name must be unique across controller
groups. A single runner configuration must not be selected by both webhook and
scale-set orchestration.

## Consequences

This keeps ownership boundaries explicit: the TypeScript controller is the sole
GitHub API owner, while Terraform owns only the AWS deployment and its input
references. Destroying Terraform stops the controller but does not issue a
GitHub delete. Operators must authorize the configured GitHub scope before
applying the AWS controller configuration and must handle renames as an
explicit migration. The controller task role can remain read-only for SSM
discovery and credential reads, reducing its blast radius.

## Alternatives considered

- **Model GitHub scale sets as Terraform resources:** not selected for the
  current implementation. The TypeScript controller already owns all runtime
  GitHub API operations (lookup, registration, and label reconciliation), while
  Terraform owns the AWS substrate. Adding a second Terraform owner would
  create competing GitHub API lifecycles and require an explicit import,
  update, and destroy contract.
- **Persist every discovered ID from the controller:** rejected for now
  because it would require explicit, caller-visible SSM write targets and an
  expanded IAM contract. Read-side caching remains possible through
  pre-provisioned parameters.
