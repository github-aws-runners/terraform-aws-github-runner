# ADR-004: Warm Pool Standby

## Status

Proposed

## Date

2026-09-30

## Context

A runner is either running (full compute cost, instant pickup) or terminated
(no cost, a cold start of several minutes). A stopped EC2 instance keeps its
EBS volume, costs only storage, and starts in seconds. A tier of stopped,
pre-booted instances can therefore cut startup time without paying for idle
compute.

Stopped instances bring a few constraints:

- Cloud-init runs user-data only on the first boot, so a started instance needs
  another way to register as a runner.
- Spot instances can only be stopped with a persistent request, and
  terminating such an instance re-opens the request unless it is cancelled
  first.
- A boot takes longer than a Lambda timeout, so no lambda can wait for an
  instance to become ready.
- A separate inventory drifts from EC2, and lifecycle ownership spread over
  several components leaves orphaned instances.

ADR-002 separates orchestration from compute providers. Stop and start are
EC2-specific, so the design must fit behind the compute-provider boundary.

## Decision

Warm is a mode of the existing pool. With `warm_pool.enabled = true`, the pool
keeps `pool_config[].size` stopped instances instead of running idle runners.

### Ownership

| Component   | Owns                   | Actions                                   |
|-------------|------------------------|-------------------------------------------|
| Pool lambda | PRIMING, WARM          | launch, classify, evict, refill           |
| Scale-up    | WARM -> ACTIVE         | claim, hand over registration, start      |
| Scale-down  | ACTIVE                 | unchanged, plus a sweep of stopped leftovers |
| Instance    | PRIMING -> WARM        | prepare, then `shutdown -h`               |

A warm instance is activated at most once. Runners that ran a job are never parked again; a non-ephemeral runner keeps its normal lifecycle after activation.

### Lifecycle

```text
  pool: warm + priming < target --> launch (RunInstances, shutdown behavior stop)
                                          |
                                          v
  PRIMING  running, not registered with GitHub; prepares, then shuts down
     |
     v
  WARM     stopped by the instance itself
     |  scale-up: claim (DynamoDB index), tag, StartInstances, cancel spot
     |            request if any, then write registration config to SSM
     v
  ACTIVE   boot hook waits for its config, registers, runs the job
```

- **Priming never registers with GitHub.** Warm instances are owner-agnostic,
  so the pool needs no GitHub API calls and warm mode does not require
  organization runners. The owner is bound when scale-up hands over the
  registration config.
- **Instances park themselves.** No lambda waits for a boot. One EventBridge
  rule per deployment sends EC2 stop events to an SQS queue; one consumer
  lambda reads them in batches and marks primed instances warm right away. The
  scheduled pool run is the fallback.
- **Boot hook.** A systemd unit reruns the start script on every boot and picks
  a mode: run (registration config exists), prime (warm-pool member, not
  activated), or wait (cold path).
- **EC2 is the source of truth, DynamoDB the index.** The pool classifies
  instances from EC2 state, `StateReason`, spot request state, and tags. A
  DynamoDB table indexes the warm-pool instances, so the pool reads EC2 by
  instance ID and scale-up picks candidates without calling EC2. Each pool run
  writes the EC2 state back to the index. Scale-up claims an entry before
  starting it, which also stops the pool destroying an instance being
  activated. About once an hour the pool lists its instances by tag and adds
  any missing from the index.

### Eviction

On every pool event, before refilling, the pool destroys:

- warm instances older than `max_age_hours`;
- warm instances whose AMI or launch-template version is outdated;
- the oldest warm instances above the target;
- instances priming longer than `runner_boot_time_in_minutes`;
- warm instances whose start failed for lack of capacity three times;
- stopped instances that did not stop themselves, or whose spot request can no
  longer start them;
- tagged spot requests without a live instance.

### Spot

Warm spot instances use `RunInstances` with a persistent request, interruption
behavior `stop`, `ValidUntil` set to `max_age_hours` plus a margin, and tags on
both the instance and the request. `CreateFleet` cannot be used, because spot
instances in a fleet cannot be stopped. Cold launches keep using `CreateFleet`.

Every destroy cancels the spot request before terminating. When scale-up
starts a warm spot instance, it cancels the request immediately after the
start. The running instance then has no request that can respawn it, and the
rest of the lifecycle does not need to know about spot requests.

A sandbox spike confirmed the AWS behavior this relies on:

- An OS shutdown reports `Client.InstanceInitiatedShutdown` for on-demand and
  spot instances. The spot request status follows about a minute later.
- A request can be cancelled while its instance is `pending` or `running`; the
  instance keeps running and nothing respawns.
- The shutdown behavior of a spot instance cannot be modified. A detached spot
  instance stops rather than terminates on an OS shutdown, and cannot be
  started again.
- After `ValidUntil`, a stopped spot instance is neither terminated nor
  startable.

### Safety net

Warm instances carry `ghr:warm-expires-at`. Scale-down destroys stopped
warm-pool instances that are past that time or were activated. This cleans
up after warm mode is disabled or the pool is removed. It also covers
activated spot instances that stopped instead of terminating.

## Consequences

### Positive

- Jobs start from a pre-booted disk in seconds, while idle warm capacity costs
  only EBS storage.
- One owner per state. Persistent spot requests are handled only by the pool
  (launch, evict) and at activation (cancel).
- Schedule-based sizing comes from the existing `pool_config`, including a size
  of 0 to drain outside working hours.
- Works for organization and repository runners, with on-demand and spot.
- Default off. Hot pools are unchanged.

### Negative

- Warm spot launches lose `CreateFleet` price-capacity-optimized placement and
  fall back through instance types and subnets instead.
- Refill and eviction happen only on pool schedule events. Primed instances
  become available on their stop event. EC2 stop events cannot be filtered by
  tag, so the consumer receives every instance stop in the region and describes
  each batch once by ID.
- Custom user-data templates must keep the start script for the boot hook.
  Otherwise warm instances never park and are evicted.
- Linux only at first; Windows was added later with a startup scheduled task as its boot hook. macOS is not supported.
- A start can fail for lack of capacity, because a stopped instance starts only
  with its own instance type in its own Availability Zone. Scale-up then
  launches cold, so a failed start is never worse than today. The instance is
  skipped for a cool-down and replaced after repeated failures. Scale-up
  registers the runner only after a successful start, as for a new instance,
  so a failed start leaves nothing registered with GitHub.

## Alternatives Considered

- **Stop idle runners in scale-down.** Rejected: parks disks that
  already ran jobs, and spreads ownership over several components.
- **Scale-down as warm-tier owner.** Rejected: scale-down would need permission
  to create instances, and would lose schedule-based sizing.
- **EC2 tag scans as the only inventory.** Rejected for large pools: a
  tag-filtered `DescribeInstances` takes longer with every matching instance,
  while a read by instance ID stays fast. The index keeps EC2 as the source of
  truth and is reconciled against a tag scan, which bounds drift.
- **Lambda-driven parking after a readiness signal.** Rejected: bounded by the
  Lambda timeout.
- **EC2 hibernate.** Deferred: needs specific instance types and AMIs, for a
  small gain over stop.
- **Auto Scaling warm pools.** Rejected: the module uses EC2 Fleet and its own
  lifecycle, not Auto Scaling groups.
