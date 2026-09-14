# Multiple organizations

Enable `enable_multi_org_runners = true` to share a control plane across organizations. Runners register in the organization that owns the repository in the webhook. This selects organization-level registration even if `enable_organization_runners` is false. The flag defaults to false, preserving existing registration, installation selection, pool ownership, and scale-down behavior.

Install the GitHub App in each target organization. An enterprise-owned app can be used through its organization installations. The app needs **Self-hosted runners: write** at organization scope for [organization JIT configuration](https://docs.github.com/en/rest/actions/self-hosted-runners#create-configuration-for-a-just-in-time-runner-for-an-organization), along with the existing workflow-job permissions and webhook subscriptions. This mode uses organization runner APIs.

## Scheduled pools

Add `org` to each `pool_config` schedule:

```hcl
enable_multi_org_runners = true
enable_ephemeral_runners = true

pool_config = [
  {
    org                          = "org-a"
    schedule_expression          = "cron(0 8 * * ? *)"
    schedule_expression_timezone = "UTC"
    size                         = 2
  },
  {
    org                          = "org-b"
    schedule_expression          = "cron(0 8 * * ? *)"
    schedule_expression_timezone = "UTC"
    size                         = 5
  },
]
```

An omitted `org` uses `pool_runner_owner`. Multi-org pools must have a valid organization login in one of those fields. Use the organization's login rather than its display name. Multi-org mode normalizes it to lowercase across pools, webhooks, retries, and cleanup. Without the flag, `org` is ignored and the existing default owner is used.

Pool reconciliation lists GitHub runners and compute instances for that organization only. `runners_maximum_count` applies separately to each organization within a runner configuration. Each organization shares that runner configuration's labels, runner-group name, compute settings, and maximum count. A schedule defines a target size, not an additive pool; avoid conflicting schedules for the same organization. Existing scale-up/pool concurrency limits still apply, and maximum checks are not atomic across concurrent invocations.

For the legacy `modules/multi-runner` interface, set `enable_multi_org_runners` and `pool_config` inside the entry's `runner_config`. For the v2 interface and `modules/runner-config`, set `orchestration_provider.webhook.github.multi_org_runners = true` and put the schedules under `orchestration_provider.webhook.lambda.pool.config`. Its default pool owner is `lambda.pool.runner_owner`.

## Installation and runner lifecycle

- Scale-up and job retry reuse the primary app's webhook installation ID. Additional apps, or events without an installation ID, resolve the selected app's installation for the target organization. Every configured app that can be selected must be installed in all target organizations.
- Pool and scale-down resolve an organization installation with the selected app. Preconfigured global installation IDs are ignored in multi-org mode because they cannot identify installations in several organizations.
- Runner-group IDs are cached by organization and group name. A group named `Default` in one organization cannot supply another organization's group ID. Existing unscoped entries are not reused in multi-org mode.
- EC2 already persists the organization in `ghr:Owner` alongside `ghr:Type = Org`. Scale-down, deregistration, and orphan checks use that ownership metadata; no additional tag is required. Capacity lookups include existing mixed-case owner tags, and scale-down groups those tags under the same lowercase organization. EC2 queries retain their environment and runner-type filters, then compare owner tags locally because AWS tag matching is case-sensitive. Other compute providers use the equivalent owner/type fields in their provider contract.
- Scale-down applies the existing idle configuration independently to each organization. Pool sizes do not change scale-down idle settings; these remain separate controls. Orphan checks use the tagged owner's GitHub endpoints, including the final check before termination of a JIT orphan. A GitHub lookup failure does not establish that a runner is an orphan.

This feature does not verify enterprise membership. The organizations available to the GitHub Apps and the existing webhook repository allowlist define the accepted scope. Existing owner tags remain readable when toggling the flag; do not remove an app installation while it still has managed runners to clean up.
