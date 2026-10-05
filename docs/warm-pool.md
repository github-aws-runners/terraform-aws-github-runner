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

With `instance_target_capacity_type = "spot"`, warm instances are launched with `RunInstances` from a persistent spot request, because spot instances from a one-time request or a fleet cannot be stopped. The request is tagged like the instance and expires after `max_age_hours` plus 24 hours. The module always cancels the spot request before terminating a warm instance, so AWS never launches a replacement. When a warm spot instance is activated, its request is cancelled right after the start; if that fails, the pool cancels it on a later run.

A stopped instance can only start with its own instance type in its own Availability Zone, and a spot instance needs spot capacity at that moment. If the start fails, the job gets a new instance and the warm instance stays in the pool. After a start fails for lack of capacity, scale-up skips that instance for 10 minutes, and skips other warm instances of the same type and zone for the rest of that run. The pool replaces an instance whose start failed this way three times. Warm spot launches try the configured instance types and subnets in order; new instances for jobs still use EC2 Fleet.

## Eviction

Each time the pool runs, before refilling, it destroys:

- warm instances older than `max_age_hours`;
- warm instances built from an outdated AMI or launch template version;
- the oldest warm instances above the pool size;
- instances that did not finish priming within `runner_boot_time_in_minutes`;
- warm instances whose start failed for lack of capacity three times;
- stopped instances that did not stop themselves (spot interruption, manual stop) or whose spot request can no longer start them;
- live spot requests of warm spot instances that were terminated, or that were activated and could not be detached; a replacement instance AWS launched for such a request is terminated too.

Scale-down additionally destroys stopped warm instances past their expiry, or that were activated and later stopped. This also cleans up after warm mode is disabled or the pool is removed.

## Custom user data

The boot hook is installed by the default start script. If you use a custom `userdata_template`, it must include the start script. See [Warm pool boot hook](configuration.md#warm-pool-boot-hook).

## Observability

With metrics enabled, the pool publishes `WarmPoolWarmInstances`, `WarmPoolPrimingInstances`, `WarmPoolEvictions` (by `Reason`), and `WarmPoolSpotLookupFailures`, and scale-up publishes `WarmPoolActivations` and `WarmPoolActivationFallbacks` (by `Reason`: `no-warm-instance`, `claim-lost`, `index-unavailable`, or `start-failed`). Activated instances log `warm-pool-activation-latency-seconds=<n>`, the time from activation until the runner starts.

## Costs and limits

- Every warm instance keeps its EBS volumes. Check the EBS volume and storage quotas for large pools.
- Warm instances do not count toward `runners_maximum_count`. Activating one does, like launching a new instance.
- The pool reads its instances from EC2 by ID, and lists them by tag only about once an hour. Scale-up does not list instances to activate a warm one. If the warm pool index cannot be read, scale-up launches new instances and reports `index-unavailable`.
- EC2 stop events cannot be filtered by tag, so the stop-event queue receives every instance stop in the account and region. Each batch costs one `DescribeInstances` by ID; instances outside the warm pools need no further calls.
- Spot API request limits are shared by everything in the account and region. A spot warm pool reads spot requests only by ID, at most once per run, and only for its own instances; scale-up and on-demand warm pools do not read spot requests at all. If the Spot API throttles that read, the run continues without it: stopped spot instances are classified from EC2 data, spot request cleanup waits for a later run, and `WarmPoolSpotLookupFailures` is published.

## Disabling

Set `enabled = false`. With a `pool_config` left in place the pool returns to keeping idle runners, which needs GitHub API access and, for organization runners, `pool_runner_owner`; remove `pool_config` as well to stop the pool. Scale-down removes the remaining stopped warm instances once they expire. To remove them immediately, set the pool size to `0` for one schedule run before disabling.
