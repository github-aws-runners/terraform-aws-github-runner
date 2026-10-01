# Warm pool standby

A warm pool keeps stopped, pre-booted runner instances ready. When a job arrives, scale-up starts one of them instead of launching a new instance. A stopped instance costs only its EBS volumes, and starting it takes seconds instead of a full boot. See [ADR-004](adr/0004-warm-pool-standby.md) for the design.

!!! note
    Warm pools support Linux runners only, and require instance metadata tags (the default).

## How it works

1. The pool Lambda launches instances until the number of warm and priming instances matches the pool size from `pool_config`.
2. Each instance installs the runner, prepares itself, and shuts itself down. It never registers with GitHub while it is in the pool.
3. When a job is queued, scale-up claims the newest warm instance, writes its registration config, and starts it. A boot hook registers the runner and runs the job.
4. A warm instance is activated at most once and never returns to the pool. After activation it follows the normal runner lifecycle: an ephemeral runner runs one job, a non-ephemeral runner can pick up more jobs until scale-down removes it.
5. If no warm instance is available, or starting one fails, scale-up launches a new instance as usual.

The pool Lambda makes no GitHub API calls in warm mode, so warm pools work for organization and repository runners, and `pool_runner_owner` is not required.

With warm mode enabled, `pool_config` sizes the warm pool instead of the pool of idle runners, so one runner configuration keeps either idle runners or warm instances, not both.

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

The pool only refills and evicts when a `pool_config` schedule fires, so use a frequent schedule (for example every minute) while warm instances are wanted. A schedule with `size = 0` drains the pool, for example outside office hours.

### Bursts of jobs

Scale-up has a reserved concurrency of 1 by default. When many jobs are queued at once, the extra SQS messages are throttled and only retried after the queue visibility timeout, so warm instances are handed out roughly one per minute. For warm pools, let scale-up batch and run in parallel, for example:

```yaml
runner_config:
  lambda_event_source_mapping_maximum_batching_window_in_seconds: 10
  scale_up_reserved_concurrent_executions: 5
```

Concurrent invocations claim warm instances through a short-lived lease, so each warm instance is activated by at most one invocation.

The examples in [`examples/multi-runner`](https://github.com/github-aws-runners/terraform-aws-github-runner/tree/main/examples/multi-runner/templates/runner-configs) include an on-demand (`linux-x64-warm.yaml`) and a spot (`linux-x64-warm-spot.yaml`) warm pool.

## On-demand and spot

With `instance_target_capacity_type = "on-demand"`, warm instances are regular on-demand instances.

With `instance_target_capacity_type = "spot"`, warm instances are launched with `RunInstances` from a persistent spot request, because spot instances from a one-time request or a fleet cannot be stopped. The request is tagged like the instance and expires after `max_age_hours` plus 24 hours. The module always cancels the spot request before terminating a warm instance, so AWS never launches a replacement. When a warm spot instance is activated, its request is cancelled right after the start; if that fails, the pool cancels it on a later run.

Starting a stopped spot instance needs spot capacity at that moment. If the start fails, the job gets a new instance and the warm instance stays in the pool. Warm spot launches try the configured instance types and subnets in order; new instances for jobs still use EC2 Fleet.

## Eviction

Each time the pool runs, before refilling, it destroys:

- warm instances older than `max_age_hours`;
- warm instances built from an outdated AMI or launch template version;
- the oldest warm instances above the pool size;
- instances that did not finish priming within `runner_boot_time_in_minutes`;
- stopped instances that did not stop themselves (spot interruption, manual stop) or whose spot request can no longer start them;
- tagged spot requests without an instance.

Scale-down additionally destroys stopped warm instances past their expiry, or that were activated and later stopped. This also cleans up after warm mode is disabled or the pool is removed.

## Custom user data

The boot hook is installed by the default start script. If you use a custom `userdata_template`, it must include the start script. See [Warm pool boot hook](configuration.md#warm-pool-boot-hook).

## Observability

With metrics enabled, the pool publishes `WarmPoolWarmInstances`, `WarmPoolPrimingInstances`, and `WarmPoolEvictions` (by `Reason`), and scale-up publishes `WarmPoolActivations` and `WarmPoolActivationFallbacks` (by `Reason`). Activated instances log `warm-pool-activation-latency-seconds=<n>`, the time from activation until the runner starts.

## Costs and limits

- Every warm instance keeps its EBS volumes. Check the EBS volume and storage quotas for large pools.
- Warm instances do not count toward `runners_maximum_count`. Activating one does, like launching a new instance.

## Disabling

Set `enabled = false`. With a `pool_config` left in place the pool returns to keeping idle runners, which needs GitHub API access and, for organization runners, `pool_runner_owner`; remove `pool_config` as well to stop the pool. Scale-down removes the remaining stopped warm instances once they expire. To remove them immediately, set the pool size to `0` for one schedule run before disabling.

## Migrating from the warm pool preview branch

Deployments that ran the earlier warm pool preview (PR #5204) can have leftover persistent spot requests and stopped instances. Drain them before deploying:

```bash
export AWS_REGION=<region>
PREFIX=<your-prefix>

# 1. Cancel runner spot requests of this deployment that are still open, active, or disabled.
aws ec2 describe-spot-instance-requests \
  --filters Name=state,Values=open,active,disabled Name=tag:ghr:Application,Values=github-action-runner \
        "Name=tag:ghr:environment,Values=${PREFIX}*" \
  --query 'SpotInstanceRequests[].SpotInstanceRequestId' --output text \
  | xargs -r aws ec2 cancel-spot-instance-requests --spot-instance-request-ids

# 2. Terminate stopped runner instances of this deployment.
aws ec2 describe-instances \
  --filters Name=instance-state-name,Values=stopped Name=tag:ghr:Application,Values=github-action-runner \
        "Name=tag:ghr:environment,Values=${PREFIX}*" \
  --query 'Reservations[].Instances[].InstanceId' --output text \
  | xargs -r aws ec2 terminate-instances --instance-ids
```

Untagged instances launched by leaked spot requests can be found with `aws ec2 describe-instances --filters Name=instance-lifecycle,Values=spot` and their `SpotInstanceRequestId`.
