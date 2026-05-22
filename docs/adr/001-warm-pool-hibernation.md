# ADR-001: Warm Pool with Stop/Hibernate for Idle Pool Runners

## Status

Proposed

## Date

2026-05-22

## Context

The current pool system maintains a configurable number of idle GitHub Actions runners via the pool lambda. These runners are launched on a cron schedule and sit running (consuming compute costs) until either:

1. A job picks them up, or
2. The scale-down lambda terminates them after the idle count is exceeded.

This "always running" model has significant cost implications:

- **Waste during idle periods**: Pool runners that never receive a job still consume full EC2 compute costs until scale-down terminates them.
- **Cold start latency**: When all idle runners are consumed and new ones must be launched, users experience full boot time (AMI boot + runner registration + tool installation). This can be 2-5 minutes depending on instance type and AMI.
- **Binary choice**: Currently the only options are "running" (full cost) or "terminated" (zero cost but full cold start). There is no middle ground.

AWS provides EC2 Stop and Hibernate capabilities that preserve the EBS root volume (and optionally RAM state). A stopped instance:

- Incurs **zero compute cost** (no per-second billing).
- Retains its **EBS volume** (small storage cost, typically $0.08-0.10/GB-month for gp3).
- Can be **restarted in 10-30 seconds** vs. 2-5 minutes for a fresh launch.
- Preserves the instance ID, network interfaces, and private IP.

This makes stopped instances an ideal "warm" tier between fully running (hot) and terminated (cold).

## Decision

We will implement a **warm pool system** with three instance states, controlled by a feature flag:

### Instance States

| State | Cost | Startup Time | Description |
|-------|------|-------------|-------------|
| **Hot** (running) | Full compute + EBS | 0s (already running) | Currently idle, registered with GitHub, ready to accept jobs |
| **Warm** (stopped) | EBS only | 10-30s | Stopped instance with preserved volume, must be started + re-registered |
| **Cold** (terminated) | None | 2-5 min | No instance exists, must launch from scratch |

### Behavior Changes

#### Scale-Down Lambda (modified)

When the feature flag `enable_warm_pool` is enabled:

1. **Instead of terminating** idle runners that exceed `idleCount`, the scale-down lambda will **stop** them and record their state in a **DynamoDB table**.
2. Before stopping, the runner is **deregistered from GitHub** (existing behavior preserved).
3. A new config parameter `warm_pool_config` controls:
   - `maxWarmInstances`: Maximum number of stopped instances to retain (prevents EBS cost explosion). Default: same as pool size.
   - `maxWarmAgeHours`: Maximum age (in hours) of a warm instance before it is terminated instead of kept. Default: 168 (7 days). Prevents stale AMIs from accumulating.
4. If a runner exceeds `maxWarmInstances` or `maxWarmAgeHours`, it is **terminated** (existing behavior).

#### Scale-Up Lambda (modified)

When a job is queued and no hot runner is available:

1. **Before creating a new instance**, query the **DynamoDB warm pool table** for available stopped instances matching the runner config (owner, environment).
2. If a warm instance exists:
   - **Start** the instance (EC2 `StartInstances` API).
   - Remove the DynamoDB record (atomic delete prevents race conditions).
   - The instance's existing user-data/startup script re-registers with GitHub on boot.
   - Tag: set `ghr:started-from-warm-pool=true` for metrics.
3. If no warm instance exists (or start fails), fall through to the existing `createRunner()` flow (cold start).

#### Pool Lambda (modified, separate feature flag)

The pool lambda gets its own strategy setting (`pool_strategy`) independent of the scale-down warm pool behavior. This enables three distinct operational modes:

| `pool_strategy` | `warm_pool_config.enabled` | Behavior |
|-----------------|---------------------------|----------|
| `hot` (default) | `false` | Current behavior: pool creates running instances, scale-down terminates them |
| `hot` | `true` | Pool creates running instances, scale-down stops them into warm tier |
| `warm` | `true` | Pool maintains **stopped** instances only (no idle compute). Scale-up/webhook starts them on demand |
| `warm` | `false` | Invalid — rejected at plan time |

When `pool_strategy = "warm"`:

1. The pool lambda **creates instances and waits `warm_pool_ready_delay_seconds`** (default 30s) before stopping them. This grace period gives the instance time to boot, register with GitHub, and potentially pick up a queued job. If the runner picks up a job during this window, it is **not stopped** — it runs normally.
2. After the grace period, if the runner is still idle (not busy), it is deregistered from GitHub, stopped, and tagged as warm. The pool target represents the number of **warm** (stopped) instances to maintain.
3. No permanently running idle runners exist from the pool — zero long-term compute waste.
4. Scale-up and webhook flows start warm instances when jobs arrive (10-30s startup).
5. The `idle_config` / `idleCount` setting becomes irrelevant for pool runners since none are kept running long-term.

When `pool_strategy = "hot"` (default, backward compatible):

1. Pool creates running instances as today.
2. If `warm_pool_config.enabled = true`, scale-down stops excess idle runners into the warm tier instead of terminating.
3. Scale-up can still use warm instances as a fast fallback before cold-launching.

### Feature Flag

- Terraform variable: `warm_pool_config.enabled` (bool, default `false`) — controls whether scale-down stops instances into a warm tier.
- Terraform variable: `pool_strategy` (string, `"hot"` or `"warm"`, default `"hot"`) — controls whether the pool lambda maintains running or stopped instances. **Independent from `warm_pool_config`** to allow warm-only deployments with zero idle compute.
- Both are passed as environment variables to the relevant lambdas.
- When both are at defaults, behavior is identical to today (no breaking changes).

### Configuration

New Terraform variable structure (nested in existing runner config patterns):

```hcl
variable "pool_strategy" {
  description = "Strategy for the pool lambda. 'hot' keeps runners running (current behavior). 'warm' maintains stopped instances only — zero idle compute, 10-30s start on demand."
  type        = string
  default     = "hot"
  validation {
    condition     = contains(["hot", "warm"], var.pool_strategy)
    error_message = "pool_strategy must be 'hot' or 'warm'."
  }
}

variable "warm_pool_config" {
  description = "Configuration for the warm pool tier. Controls how stopped instances are managed."
  type = object({
    enabled                    = bool
    max_warm_instances         = number
    max_warm_age_hours         = number
    warm_pool_ready_delay_seconds = number
  })
  default = {
    enabled                    = false
    max_warm_instances         = 3
    max_warm_age_hours         = 168
    warm_pool_ready_delay_seconds = 30
  }
}
```

**Validation**: `pool_strategy = "warm"` requires `warm_pool_config.enabled = true`. Terraform will error at plan time if this invariant is violated.

### State Store (DynamoDB)

Warm pool state is managed in a **DynamoDB table** rather than EC2 instance tags or DescribeInstances API calls. This avoids rate limiting, provides single-digit millisecond lookups, and enables atomic operations to prevent race conditions between concurrent lambda invocations.

**Table**: `{prefix}-warm-pool` (PAY_PER_REQUEST billing)

| Attribute | Type | Purpose |
|-----------|------|---------|
| `instanceId` (PK) | String | EC2 instance ID |
| `runnerOwner` (GSI PK) | String | GitHub org/repo owner |
| `stoppedAt` (GSI SK) | String | ISO 8601 — enables newest-first selection |
| `environment` | String | Runner environment |
| `runnerType` | String | `Org` or `Repo` |
| `amiId` | String | AMI at time of stop (staleness detection) |
| `instanceType` | String | For informational/filtering purposes |
| `az` | String | Availability zone |
| `expiresAt` (TTL) | Number | Auto-cleanup of stale records |

DynamoDB TTL auto-deletes records past `max_warm_age_hours`. The scale-down lambda also actively terminates instances during its eviction pass.

### Tags

EC2 instance tags are still used for **observability and cost allocation** (not for state lookups):

| Tag | Value | Purpose |
|-----|-------|---------|
| `ghr:started-from-warm-pool` | `true` | Instance was started from warm pool by scale-up (metrics) |
| `ghr:warm-pool-grace-hit` | `true` | Instance picked up a job during the pool lambda's grace window |

**Observability scenarios:**

| Scenario | State change | How to track |
|----------|-------------|-------------|
| Scale-up restarts a stopped warm instance | DynamoDB record deleted + EC2 tag `ghr:started-from-warm-pool=true` | Count instances with tag / CloudWatch metric |
| Pool lambda grace window: instance picks up job before being stopped | EC2 tag `ghr:warm-pool-grace-hit=true` | Count instances with tag / CloudWatch metric |
| Instance stopped into warm tier | DynamoDB record created | Query DynamoDB for current warm pool size |
| Warm instance terminated (age/cap/AMI eviction) | DynamoDB record deleted + EC2 instance terminated | CloudWatch metric `WarmPoolEvictions` |

The pool lambda sets `ghr:warm-pool-grace-hit=true` when it detects a runner became busy during the `warm_pool_ready_delay_seconds` window. This lets operators measure how often the grace window saves a stop/start cycle — a high rate of grace hits means jobs are arriving frequently and the `warm` strategy is working efficiently even without going through the stopped state.

### IAM Permissions

The Lambda execution roles need additional permissions:

**EC2** (scoped to `ghr:Application=github-action-runner` tag):
- `ec2:StartInstances` — to start warm instances
- `ec2:StopInstances` — to stop instances instead of terminating

**DynamoDB** (scoped to warm pool table ARN):
- `dynamodb:PutItem` — record new warm pool entries (scale-down, pool lambda)
- `dynamodb:DeleteItem` — remove entries on start or termination (scale-up, scale-down, pool lambda)
- `dynamodb:Query` — find available warm instances by owner (scale-up, pool lambda)
- `dynamodb:GetItem` — check specific instance state (all lambdas)

## Consequences

### Positive

- **Cost reduction**: Idle pool runners that never get a job now cost only EBS storage (~$0.80/month for a 10GB gp3 volume) instead of full EC2 compute ($30-150+/month depending on instance type).
- **Faster startup**: Warm instances start in 10-30s vs. 2-5 minutes for cold launches. The EBS volume already contains the OS, runner binary, and any pre-installed tools.
- **Preserved AMI investment**: Pre-baked AMIs with heavy toolchains (Docker images, SDKs) don't need to be re-downloaded.
- **Backward compatible**: Feature flag ensures no behavior change for existing users.
- **Graceful degradation**: If warm instances fail to start, the system falls through to cold launch.

### Negative

- **EBS costs accumulate**: Each warm instance retains its EBS volume. With `max_warm_instances` and `max_warm_age_hours` controls, this is bounded, but operators must be aware.
- **Stale state risk**: A stopped instance may have outdated packages, expired credentials, or stale Docker caches. The startup script must handle re-registration and basic validation.
- **Instance type lock-in**: A stopped instance retains its instance type. If the launch template or instance type config changes, warm instances become invalid and must be terminated.
- **Complexity**: Three-state lifecycle is more complex than the current two-state (running/terminated) model.
- **Spot instances**: Stopped spot instances can be reclaimed by AWS at any time. More critically, **one-time spot requests (the module default) cannot be stopped at all** — the EC2 API returns `UnsupportedOperation`. The warm pool works only with on-demand or persistent spot instances. The scale-down lambda handles this gracefully by falling back to terminate, but operators must set `instance_target_capacity_type = "on-demand"` for the warm pool to actually accumulate stopped instances. See [EC2 Instance Lifecycle and Warm Pool Compatibility](#ec2-instance-lifecycle-and-warm-pool-compatibility) for details.

### Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| EBS cost explosion | `max_warm_instances` hard cap + `max_warm_age_hours` TTL |
| Stale AMI on warm instance | Compare instance's AMI ID against current launch template; terminate if mismatched |
| Spot reclamation | Warm pool is best-effort for spot — if AWS reclaims a stopped spot instance, scale-up falls through to cold launch. Future: `warm_pool_capacity_type_override` to force on-demand for pool instances |
| Runner binary outdated | Startup script always pulls latest runner version (existing behavior with `DISABLE_RUNNER_AUTOUPDATE=false`) |
| GitHub registration failure on restart | If re-registration fails, tag as orphan and let next scale-down cycle terminate |

## Alternatives Considered

### 1. EC2 Hibernate (instead of Stop)

Hibernate preserves RAM state, enabling even faster resume (~5-10s). However:

- Requires specific instance types and AMI configuration
- Requires pre-allocated EBS space for RAM dump
- More complex setup and not all instance families support it
- The marginal benefit over Stop (5-10s vs 10-30s) doesn't justify the complexity

**Decision**: Start with Stop. Hibernate can be a future enhancement for specific instance types.

### 2. AWS EC2 Auto Scaling Warm Pools

AWS natively supports warm pools in Auto Scaling Groups. However:

- This module uses EC2 Fleet API, not ASGs
- Would require fundamental architecture change
- Less control over tagging and lifecycle integration with GitHub
- Doesn't integrate with the existing pool/scale-down lambda logic

**Decision**: Implement warm pool logic in the existing lambda functions for tighter integration.

### 3. EBS Snapshot + Fast Launch

Take EBS snapshots of pool instances and use them for fast launch:

- Still requires new instance creation (no IP/instance preservation)
- Snapshot management adds complexity
- Fast Launch has availability zone constraints

**Decision**: Stop/Start is simpler and achieves comparable startup times.

## EC2 Instance Lifecycle and Warm Pool Compatibility

The warm pool relies on the EC2 `StopInstances` / `StartInstances` APIs. Not all EC2 purchase options support stop/start:

### Instance Types by Purchase Option

| Purchase Option | Can Stop/Start? | Warm Pool Compatible? | Cost vs On-Demand |
|----------------|----------------|----------------------|-------------------|
| **On-demand** | Yes | Yes (fully reliable) | 100% (baseline) |
| **Persistent Spot** | Yes | Yes (best-effort) | 60-90% discount |
| **One-time Spot** | No | No — must terminate | 60-90% discount |

### What is a Persistent Spot Request?

AWS Spot Instances come in two request types:

- **One-time request** (default in this module via EC2 Fleet): AWS fulfills the request once. The instance **cannot be stopped** — only terminated. If interrupted by AWS, it is terminated and gone. This is what `instance_target_capacity_type = "spot"` uses today.

- **Persistent request**: AWS keeps the request active. The instance **can be stopped and restarted**. When you stop a persistent spot instance, the underlying capacity is released (no compute cost), but the request remains open. When you start it, AWS attempts to re-acquire capacity at the current spot price. If capacity is unavailable, the start may be delayed.

### Cost Comparison for Warm Pool

Assuming a `m5.large` in eu-west-1 (~$0.096/hr on-demand, ~$0.035/hr spot):

| Strategy | Running Cost | Stopped Cost | Monthly idle cost (1 instance, 50% idle) |
|----------|-------------|-------------|------------------------------------------|
| Hot pool (on-demand) | $0.096/hr | N/A (always running) | ~$34.56 |
| Hot pool (spot) | $0.035/hr | N/A (always running) | ~$12.60 |
| Warm pool (on-demand) | $0.096/hr when active | ~$0.80/mo EBS only | ~$0.80 + active hours |
| Warm pool (persistent spot) | $0.035/hr when active | ~$0.80/mo EBS only | ~$0.80 + active hours |

The warm pool's value proposition is strongest when runners spend significant time idle: the stopped EBS cost ($0.80/mo for 10GB gp3) vs running compute ($12-35/mo).

### Persistent Spot Caveats

1. **Restart not guaranteed**: When starting a stopped persistent spot instance, AWS may not have capacity at the current spot price. The instance stays in `pending` until capacity is available. The scale-up lambda should implement a timeout and fall back to cold launch.

2. **Price changes**: If the spot price has risen above your max price since the instance was stopped, the start will fail.

3. **Reclamation while stopped**: AWS can reclaim (terminate) a stopped spot instance if it needs the capacity, though this is rare for stopped instances.

4. **Not currently supported by this module**: The EC2 Fleet `CreateFleet` API used by this module creates one-time spot requests. Supporting persistent spot requires either:
   - Using `RunInstances` with `InstanceMarketOptions.SpotOptions.SpotInstanceType = "persistent"`, or
   - Using `CreateFleet` with `type = "maintain"` instead of `"instant"`

### Recommended Configuration

For warm pool deployments, use one of:

1. **On-demand** (`instance_target_capacity_type = "on-demand"`): Fully reliable, higher cost when active but zero cost when stopped. Best for critical workloads.

2. **Spot for scale-up, on-demand for pool** (future `warm_pool_capacity_type_override`): Scale-up launches cheap spot instances for burst jobs; pool maintains on-demand instances that reliably stop/start. Best cost-to-reliability ratio.

3. **On-demand with warm pool only** (no hot pool): Set `pool_strategy = "warm"` with on-demand instances. Pool creates instances, immediately stops them. Scale-up starts them on demand. Zero idle compute cost, 10-30s start time, fully reliable.

> **Current limitation**: If `instance_target_capacity_type = "spot"` (the default), the warm pool stop will fail because this module uses one-time spot requests. The scale-down lambda handles this gracefully by falling back to terminate, but no warm instances will accumulate. To use the warm pool effectively, set `instance_target_capacity_type = "on-demand"` for the runner config that uses warm pool.

## Implementation Plan

See [docs/adr/001-warm-pool-implementation-plan.md](001-warm-pool-implementation-plan.md) for the phased implementation plan.
