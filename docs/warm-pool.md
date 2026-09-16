# Warm Pool

The warm pool feature reduces runner startup latency from 2–5 minutes to 10–30 seconds by **stopping** idle EC2 instances instead of terminating them. Stopped instances retain their EBS volume (OS, runner binary, caches) and can be restarted on demand when a new job arrives.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Instance Lifecycle                             │
├─────────────┬──────────────┬────────────────────────────────────────────┤
│   State     │  Cost        │  Startup Time                              │
├─────────────┼──────────────┼────────────────────────────────────────────┤
│ Hot         │  Full compute│  0s (already running, registered)          │
│ Warm        │  EBS only    │  10–30s (start + re-register)              │
│ Cold        │  None        │  2–5 min (launch + boot + register)        │
└─────────────┴──────────────┴────────────────────────────────────────────┘
```

## Quick Start

Enable the warm pool with spot instances for maximum cost savings:

```hcl
multi_runner_config = {
  "linux-x64" = {
    runner_config = {
      # ... other config ...
      instance_target_capacity_type = "spot"  # or "on-demand"

      # Turn on the warm tier. `enabled` switches the pool + scale-down into stop-instead-of-terminate
      # mode. This alone enables the machinery but does not create standby capacity — see below.
      warm_pool = {
        enabled               = true
        max_instances         = 3
        max_age_hours         = 168   # 7 days
        ready_timeout_seconds = 30
      }

      # REQUIRED to actually maintain standby capacity. The pool lambda is created only when
      # `pool_config` is set, and it is org-level only. Without these three settings no standby
      # instances are ever created.
      enable_organization_runners = true                 # the pool is org-level only
      pool_runner_owner           = "my-org"             # GitHub org the warm runners register to
      pool_config = [
        {
          size                = 2                          # number of WARM (stopped) instances to keep
          schedule_expression = "cron(* * * * ? *)"        # how often the pool lambda reconciles
        }
      ]
    }
  }
}
```

!!! important "A warm *standby* pool requires `pool_config` + org-level runners"

    Setting `warm_pool = { enabled = true }` is **not enough** on its own:

    - `warm_pool.enabled` only enables the stop-instead-of-terminate machinery (DynamoDB table, IAM, and the scale-down warm-parking path) and switches the pool lambda into warm mode.
    - The pool lambda itself is created **only** when `pool_config` is set, and it is **org-level only**, so it also requires `enable_organization_runners = true` and `pool_runner_owner`.

    Keep everything on the same level: because the pool stores warm instances under the org owner, scale-up must also be org-level (`enable_organization_runners = true`) or it will never find/start them.

    With **ephemeral** runners there is no other way to build standby capacity — the scale-down warm-parking path never fires because ephemeral runners self-terminate after their job. The pool lambda (via `pool_config`) is what pre-creates fresh standby instances.

    Keep `size <= warm_pool.max_instances` to avoid the pool creating instances that scale-down immediately evicts.

## How It Works

### Job Arrives → Scale-Up

1. Scale-up lambda receives a `workflow_job` event.
2. Queries DynamoDB for available stopped instances matching the runner owner/environment.
3. If a warm instance exists: **starts** it (10–30s), tags it `ghr:started-from-warm-pool=true`.
4. If no warm instance is available: creates a new instance via the standard cold-start path.

### Job Completes → Scale-Down

1. Scale-down lambda detects the runner is idle and deregistered from GitHub.
2. Instead of terminating, it **stops** the instance.
3. Records the instance in the DynamoDB warm pool table (with TTL for auto-expiry).
4. If `warm_pool.max_instances` is exceeded, oldest warm instances are terminated.

### Pool Lambda (Warm Strategy)

When `warm_pool.enabled = true` (and a `pool_config` schedule is set):

1. Pool lambda creates instances normally.
2. Each instance signals readiness from its start script once it has registered with GitHub and reached a safe-to-stop checkpoint (see [Readiness signal](#readiness-signal)). The pool lambda polls the DynamoDB `readyAt` marker and acts as soon as an instance signals — fast AMIs are parked in seconds, slow ones are never stopped mid-boot.
3. When an instance signals readiness and is still idle: deregisters from GitHub, stops the instance, adds it to DynamoDB.
4. If busy: leaves it running (tags `ghr:warm-pool-grace-hit=true` for metrics).
5. `warm_pool.ready_timeout_seconds` is the **maximum** time to wait for the signal. Any instance that never signals within it falls back to a plain idle check, so AMIs without the readiness signal still work.
6. Maintains a target count of **stopped** instances — zero idle compute cost.

### Readiness signal

Instead of waiting a fixed delay (which is too short for heavy AMIs and wasteful for light ones), the runner tells the control plane exactly when it is safe to stop:

1. After the runner registers with GitHub and is about to start listening, the start script writes a `readyAt` marker (with a short TTL) to the warm pool DynamoDB table keyed by its instance ID.
2. The pool lambda polls that marker and parks the instance as soon as it appears and the runner is still idle.
3. The marker TTL self-heals the record if the instance is never parked (for example if the lambda crashes mid-wait).

This is on by default whenever the warm pool is enabled; there is no separate flag. The instance role is granted `dynamodb:UpdateItem` on the warm pool table for this signal. The readiness signal is currently implemented for Linux runners; other operating systems fall back to the `warm_pool.ready_timeout_seconds` timeout.

## Spot Instance Support

The module fully supports spot instances with the warm pool. This provides the best cost optimization: **60–90% EC2 discount** from spot pricing + **zero compute cost** while stopped.

### How It Works with Spot

When both `warm_pool.enabled = true` and `instance_target_capacity_type = "spot"` are set, the module automatically:

1. Uses the `RunInstances` API with **persistent spot requests** instead of the default `CreateFleet` (which creates one-time spot requests that cannot be stopped).
2. Sets `InstanceInterruptionBehavior = "stop"` so AWS stops (rather than terminates) the instance on capacity reclaim.
3. Overrides `InstanceInitiatedShutdownBehavior = "stop"` (the launch template defaults to `"terminate"`, which would conflict).

This is fully transparent — no additional user configuration is needed.

### Why Not CreateFleet?

The `CreateFleet` API (used for non-warm-pool instances) always creates **one-time** spot requests. One-time spot instances:

- Cannot be stopped (`ec2:StopInstances` returns `UnsupportedOperation`)
- Can only be terminated
- Are incompatible with warm pool stop/start cycling

The `CreateFleet` API does not expose a `SpotInstanceType` parameter at all. The only APIs that support persistent spot are `RunInstances` and the legacy `RequestSpotInstances`.

Additionally, `CreateFleet` with `type = "maintain"` is not suitable because:
- The fleet manages capacity automatically — if you stop an instance, the fleet detects reduced capacity and launches a replacement (the opposite of warm pool intent).

### Trade-offs vs CreateFleet

| Feature | CreateFleet (default) | RunInstances (persistent spot) |
|---------|----------------------|-------------------------------|
| Multi-AZ diversification | Yes (spreads across subnets) | Single subnet per instance |
| Multi-instance-type | Yes (all types tried) | First configured type only |
| Allocation strategy | Configurable (lowest-price, etc.) | N/A (single type) |
| Can be stopped | No | Yes |
| Warm pool compatible | No | Yes |

For warm pool use cases, this trade-off is acceptable: the goal is fast restart from a known state, not placement diversity.

### Caveats

- **Restart not guaranteed**: When starting a stopped persistent spot instance, AWS may not have capacity at the current spot price. If the start fails, scale-up falls back to cold-launching a new instance.
- **Price fluctuations**: If the spot price has risen above your max price since the instance was stopped, the start may fail.
- **Reclamation while stopped**: AWS can terminate a stopped spot instance if capacity is needed (rare, but possible). The warm pool handles this gracefully — if an instance is gone, it's removed from DynamoDB and scale-up creates a new one.

## Configuration Reference

### `warm_pool`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | bool | `false` | Enable the warm tier. Switches the pool lambda into warm (stop-instead-of-terminate) mode and enables scale-down warm-parking. |
| `max_instances` | number | `3` | Maximum stopped instances per runner owner. Must be `>=` the largest `pool_config` size. |
| `max_age_hours` | number | `168` | Hours before a warm instance expires (DynamoDB TTL) |
| `ready_timeout_seconds` | number | `30` | Maximum seconds the pool lambda waits for an instance's readiness signal before falling back to an idle check. Instances that signal earlier are parked immediately. |

### Hot vs warm pool

The pool is created by `pool_config` (schedule + `size`). Its mode is derived from `warm_pool.enabled`:

| `warm_pool.enabled` | Behaviour |
|---------------------|-----------|
| `false` (default) | **Hot pool** — the pool keeps `size` running instances; scale-down terminates idle runners. Classic behaviour. |
| `true` | **Warm pool** — the pool keeps `size` **stopped** instances (zero idle compute); scale-down stops idle runners into the warm tier; scale-up starts a warm instance on demand. Org-level only (see [Quick Start](#quick-start)). |

### `instance_target_capacity_type`

| Value | Warm Pool Behavior |
|-------|-------------------|
| `"on-demand"` | Fully reliable stop/start. No capacity concerns. |
| `"spot"` | Automatic persistent spot. Lower cost but restart subject to capacity availability. |

## Cost Comparison

Assuming `m5.large` in eu-west-1 (~$0.096/hr on-demand, ~$0.035/hr spot), 10GB gp3 EBS ($0.80/month):

| Configuration | Monthly cost per idle runner |
|---|---|
| Hot pool, on-demand | ~$69 (always running) |
| Hot pool, spot | ~$25 (always running) |
| Warm pool, on-demand | ~$0.80 (EBS only) + compute while active |
| Warm pool, spot | ~$0.80 (EBS only) + compute while active |

The warm pool is most beneficial when runners spend significant time idle between jobs.

## Observability

### Tags

| Tag | When Set | Purpose |
|-----|----------|---------|
| `ghr:started-from-warm-pool=true` | Instance started from warm pool | Track warm starts in cost explorer / metrics |
| `ghr:warm-pool-grace-hit=true` | Instance picked up a job during grace window | Measure grace window effectiveness |

### CloudWatch Metrics

When `metrics.enable = true` and `metrics.metric.enable_warm_pool = true`:

| Metric | Description |
|--------|-------------|
| `WarmPoolInstanceStopped` | Instance stopped and added to warm pool |
| `WarmPoolInstanceStarted` | Warm instance successfully restarted |
| `WarmPoolStartFailed` | Failed to restart a warm instance |

### DynamoDB

The warm pool table (`{prefix}-warm-pool`) can be queried directly for current pool state:

```bash
aws dynamodb scan --table-name "your-prefix-warm-pool" \
  --projection-expression "instanceId, runnerOwner, stoppedAt, instanceType"
```

## Troubleshooting

### Warm instances not accumulating

- **No `pool_config`?** A pool lambda is only created when `pool_config` is set. Without it (and `enable_organization_runners = true` + `pool_runner_owner`) nothing proactively builds standby capacity — this is the most common cause of an empty warm pool. See the note in [Quick Start](#quick-start).
- **Repo-level runners?** The pool is org-level only. If `enable_organization_runners = false`, scale-up looks up warm instances under `owner/repo` while the pool stores them under the org owner, so they never match. Set `enable_organization_runners = true`.
- Verify `warm_pool.enabled = true` in your runner config.
- Check the scale-down lambda logs for stop errors.
- If using spot: confirm the lambda logs show "Created persistent spot instance" (not "Create fleet").

### Warm instance fails to start

- Check EC2 console → Spot Requests for the instance's spot request status.
- If `Status = capacity-not-available`: spot capacity is exhausted. Scale-up will fall back to cold start.
- If the instance shows as "terminated": AWS reclaimed it. The DynamoDB record will be cleaned up on next access.

### Slow restart times (>30s)

- The runner re-registration with GitHub adds latency. This is typically 5–10s.
- If the instance was stopped for a long time, the OS may run updates on boot. Consider disabling automatic updates in your AMI.

## Architecture Decision Record

For full design rationale, alternatives considered, and implementation details, see [ADR-001: Warm Pool with Stop/Hibernate](adr/001-warm-pool-hibernation.md).
