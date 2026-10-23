# Warm pool standby

A warm pool keeps stopped, pre-booted runner instances ready. When a job arrives, scale-up starts one of them instead of launching a new instance. A stopped instance costs only its EBS volumes, and starting it takes seconds instead of a full boot. See [ADR-004](adr/0004-warm-pool-standby.md) for the design.

!!! note
    Warm pools support Linux and Windows runners (not macOS), and require instance metadata tags (the default). Windows instances take longer to prime, so size `runner_boot_time_in_minutes` for a full first boot.

## How it works

1. The pool Lambda launches instances until the number of warm and priming instances matches the pool size from `pool_config`.
2. Each instance installs the runner, prepares itself, and shuts itself down. It never registers with GitHub while it is in the pool. Its stop event marks it warm within seconds.
3. When a job is queued, scale-up claims the newest warm instance in the warm pool index, starts it, and then writes its registration config, the same order as a new instance. A boot hook waits for the config, registers the runner, and runs the job.
4. A warm instance is activated at most once and never returns to the pool. After activation it follows the normal runner lifecycle: an ephemeral runner runs one job, a non-ephemeral runner can pick up more jobs until scale-down removes it.
5. If no warm instance is available, or starting one fails, scale-up launches a new instance as usual.

The pool Lambda makes no GitHub API calls in warm mode, so warm pools work for organization and repository runners, and `pool_runner_owner` is not required.

With warm mode enabled, `pool_config` sizes the warm pool instead of the pool of idle runners, so one runner configuration keeps either idle runners or warm instances, not both.

### Warm pool index

A DynamoDB table (`<prefix>-warm-pool-index`) records which instances belong to the warm pool. EC2 stays the source of truth for their state: each pool run reads the indexed instances by ID and writes changes back to the index, and scale-up picks warm instances from the index without calling EC2 to list them. Listing instances by tag gets slower with every matching instance, while reading by ID stays fast, which matters for large pools.

Scale-up claims an instance in the index before starting it, so two invocations never start the same instance, and the pool never destroys a claimed instance. A claim expires after 10 minutes. If an instance no longer matches its index entry when scale-up starts it (for example it was terminated), scale-up tries the next warm instance.

One EventBridge rule per deployment sends EC2 stop events to an SQS queue, and one consumer Lambda (`<prefix>-warm-pool-stop-events`) reads them in batches. For each batch it describes the stopped instances by ID once, keeps the warm pool instances, and marks those that stopped themselves warm in the index of their runner configuration. Pool Lambdas are not involved, so a burst of primed instances does not delay scheduled pool runs. If an event is missed, the next scheduled pool run marks the instance warm.

About once an hour the pool also lists its instances by tag and adds any instance missing from the index, for example after a Lambda crashed between launch and the index write.

## Configuration

Enable the warm pool next to `pool_config`. The pool size is the number of warm instances to keep.

### Root module

```hcl
module "runners" {
  source = "github-aws-runners/github-runner/aws"
  # ...
  pool_config = [
    { schedule_expression = "cron(* 7-18 ? * MON-FRI *)", size = 2 },
    { schedule_expression = "cron(0 19 ? * MON-FRI *)", size = 0 },
  ]
  warm_pool = {
    enabled       = true
    max_age_hours = 24
  }
}
```

### Multi-runner (v1)

```yaml
runner_config:
  runner_os: linux
  pool_config:
    - size: 1
      schedule_expression: cron(* * * * ? *)
  warm_pool:
    enabled: true
    max_age_hours: 24
```

### Multi-runner (v2)

```hcl
multi_runner_config = {
  warm = {
    orchestration_provider = {
      webhook = {
        lambda = {
          pool = {
            config = [{ schedule_expression = "cron(* * * * ? *)", size = 1 }]
            warm   = { enabled = true, max_age_hours = 24 }
          }
        }
      }
    }
    compute_provider = { aws = { ec2 = { /* ... */ } } }
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `false` | Keep the pool size of stopped instances instead of idle runners. |
| `max_age_hours` | `168` | Whole hours, at least 1, after which a warm instance is replaced. |

Primed instances become available without waiting for a schedule, but the pool only refills and evicts when a `pool_config` schedule fires, so use a frequent schedule (for example every minute) while warm instances are wanted. A schedule with `size = 0` drains the pool, for example outside office hours.

The examples in [`examples/multi-runner`](https://github.com/github-aws-runners/terraform-aws-github-runner/tree/main/examples/multi-runner/templates/runner-configs) include an on-demand (`linux-x64-warm.yaml`) and a spot (`linux-x64-warm-spot.yaml`) warm pool.

## On-demand and spot

With `instance_target_capacity_type = "on-demand"`, warm instances are regular on-demand instances.

With `instance_target_capacity_type = "spot"`, warm instances are launched with `RunInstances` from a persistent spot request, because spot instances from a one-time request or a fleet cannot be stopped. The request is tagged like the instance and expires after `max_age_hours` plus 24 hours. The module always cancels the spot request before terminating a warm instance, so AWS never launches a replacement.

### Spot request after activation

An activated warm spot instance still has its persistent request, and cancels it itself:

- After launching a warm spot instance, the pool tags its spot request with `ghr:instance-arn`, the ARN of the instance. Scale-up only activates spot instances whose request carries that tag, and adds `ghr:spot-request-id` to the instance when it activates it.
- The runner role of a spot warm pool may cancel only the spot request whose `ghr:instance-arn` equals its own instance ARN (`ec2:SourceInstanceARN`). Only the pool can tag spot requests; the runner can neither tag nor read them.
- The start script cancels the request in the background 60 seconds after the instance booted, while the job runs. AWS terminates the instance of a request that is cancelled while it is still `disabled`, as it is right after a start, so the request is never cancelled right away.
- Before the instance terminates itself, the start script makes sure the request is cancelled, which is safe at that point. If it cannot cancel the request, the instance shuts down instead of terminating, so the live request cannot launch a replacement, and scale-down destroys the stopped instance.
- The start script logs `warm-pool-spot-request-cancelled seconds-after-boot=<n>`, or `warm-pool-spot-request-cancel-failed reason=<code>`.

Scale-up does not cancel spot requests. A custom start script or runner agent used with a spot warm pool must follow the same steps, or every finished job re-opens its request and the pool has to cancel it and terminate the replacement.

A stopped instance can only start with its own instance type in its own Availability Zone, and a spot instance needs spot capacity at that moment. If the start fails, the job gets a new instance and the warm instance stays in the pool. After a start fails for lack of capacity, scale-up skips that instance for 10 minutes, and skips other warm instances of the same type and zone for the rest of that run. The pool replaces an instance whose start failed this way three times.

## Placement

New instances for jobs and new warm instances are placed differently:

- **Cold launch (scale-up):** one EC2 Fleet request with every configured instance type and subnet. EC2 places it according to `instance_allocation_strategy` and `instance_type_priorities`.
- **Warm refill (pool):** a spot instance from a fleet cannot be stopped, so warm instances are launched with `RunInstances`, which targets one instance type in one Availability Zone per call. The pool therefore ranks every instance type and subnet pair itself and spreads the refill over the ranked pairs: one instance per pair in rank order, then around again. A pair that has no capacity, or launches fewer instances than asked, passes the rest to the next pairs.
- **Warm activation (scale-up):** starts a stopped instance, which keeps the instance type and Availability Zone it was launched with (see above).

How a spot refill ranks the pairs:

| `instance_allocation_strategy` | Ranking |
|---|---|
| `capacity-optimized` | Availability Zones with a higher [Spot placement score](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-placement-score.html) first |
| `capacity-optimized-prioritized` | Higher placement score first, then `instance_type_priorities` |
| `price-capacity-optimized` | Higher placement score first, then lower current Spot price |
| `lowest-price` | Lower current Spot price first |
| `diversified` | No ranking: an even spread over Availability Zones and instance types |

Spot prices are read for `Linux/UNIX` for every runner OS; they only rank the pools, and the licence share of other operating systems hardly changes that order. Pairs that tie keep the configured order, with subnets interleaved across Availability Zones. A strategy that is not valid for spot, such as `prioritized`, is treated as `lowest-price`, as for cold launches. Placement scores need at least three instance types; with fewer, every zone scores low and the ranking falls back to priority, price or configured order.

The placement scores, Spot prices and subnet zones are read at most every 15 minutes per runner configuration, and only when a spot refill launches instances. They are cached in the warm pool index. If they cannot be read, the refill spreads like `diversified` (or uses the last values for up to another 15 minutes) and `WarmPoolReconcileErrors` is published with `Operation` `spot-placement`. Each refill logs `Warm placement plan.` with the effective strategy, the signal source and the ranked pairs, and `Warm launch request.` for every instance type and subnet it launches into.

On-demand warm refills try the instance types and subnets in configured order (in priority order for `prioritized`) and ask each pair for all remaining instances.

## Eviction

Each time the pool runs, before refilling, it destroys:

- warm instances older than `max_age_hours`;
- warm instances built from an outdated AMI or launch template version;
- the oldest warm instances above the pool size;
- instances that did not finish priming within `runner_boot_time_in_minutes`;
- warm instances whose start failed for lack of capacity three times;
- warm spot instances whose request could not be tagged with the instance ARN three times;
- stopped instances that did not stop themselves (spot interruption, manual stop) or whose spot request can no longer start them;
- live spot requests of warm spot instances that were terminated or stopped, or that were activated more than 10 minutes ago and could not cancel their request themselves; a replacement instance AWS launched for such a request is terminated too. The request of a running instance is only cancelled when it is `active`.

Scale-down additionally destroys stopped warm instances past their expiry, or that were activated and later stopped. This also cleans up after warm mode is disabled or the pool is removed. When scale-down terminates an idle activated spot runner, it cancels the spot request first.

## Custom user data

The boot hook is installed by the default start script. If you use a custom `userdata_template`, it must include the start script. See [Warm pool boot hook](configuration.md#warm-pool-boot-hook).

## Observability

With metrics enabled, the pool publishes `WarmPoolWarmInstances`, `WarmPoolPrimingInstances`, `WarmPoolEvictions` (by `Reason`), and `WarmPoolReconcileErrors` (by `Operation`), and scale-up publishes `WarmPoolActivations` and `WarmPoolActivationFallbacks` (by `Reason`: `no-warm-instance`, `claim-lost`, `index-unavailable`, or `start-failed`). Activated instances log `warm-pool-activation-latency-seconds=<n>`, the time from activation until the runner starts, and activated spot instances log the spot request cancel described above. An alarm on `WarmPoolEvictions` with `Reason` `orphaned-spot-request` shows runners that terminate without cancelling their spot request.

## Costs and limits

- Every warm instance keeps its EBS volumes. Check the EBS volume and storage quotas for large pools.
- Warm instances do not count toward `runners_maximum_count`. Activating one does, like launching a new instance.
- The pool reads its instances from EC2 by ID, and lists them by tag only about once an hour. Scale-up does not list instances to activate a warm one. If the warm pool index cannot be read, scale-up launches new instances and reports `index-unavailable`.
- EC2 stop events cannot be filtered by tag, so the stop-event queue receives every instance stop in the account and region. Each batch costs one `DescribeInstances` by ID; instances outside the warm pools need no further calls.
- A spot warm pool with a ranking strategy calls `GetSpotPlacementScores`, `DescribeSpotPriceHistory` and `DescribeSubnets` at most every 15 minutes, and only when it launches instances. These need `ec2:GetSpotPlacementScores`, `ec2:DescribeSpotPriceHistory` and `ec2:DescribeSubnets`, which the module grants to the pool of a spot warm pool.
- Spot API request limits are shared by everything in the account and region. A spot warm pool reads spot requests only by ID, at most once per run, and only for its own instances; scale-up and on-demand warm pools do not read spot requests at all. If the Spot API throttles that read, the run continues without it: stopped spot instances are classified from EC2 data, spot request cleanup waits for a later run, and `WarmPoolReconcileErrors` is published with `Operation` `describe-spot-requests`.
- A spot warm pool tags each new spot request once, and each activated spot instance cancels its own request once.

## Disabling

Set `enabled = false`. With a `pool_config` left in place the pool returns to keeping idle runners, which needs GitHub API access and, for organization runners, `pool_runner_owner`; remove `pool_config` as well to stop the pool. Scale-down removes the remaining stopped warm instances once they expire. To remove them immediately, set the pool size to `0` for one schedule run before disabling.
