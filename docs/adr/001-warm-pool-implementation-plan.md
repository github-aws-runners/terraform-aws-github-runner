# ADR-001: Implementation Plan — Warm Pool with Stop/Hibernate

## Overview

This document details the phased implementation plan for the warm pool feature described in [ADR-001](001-warm-pool-hibernation.md).

## Phase 1: Foundation (Terraform + IAM + Feature Flag + DynamoDB)

**Goal**: Wire the feature flag, permissions, and state store without changing any runtime behavior.

### Tasks

1. **Add `warm_pool_config` variable** to `modules/runners/variables.tf`
   ```hcl
   variable "warm_pool_config" {
     description = "Configuration for the warm pool tier. Controls how stopped instances are managed."
     type = object({
       enabled                       = bool
       max_warm_instances            = number
       max_warm_age_hours            = number
       warm_pool_ready_delay_seconds = number
     })
     default = {
       enabled                       = false
       max_warm_instances            = 3
       max_warm_age_hours            = 168
       warm_pool_ready_delay_seconds = 30
     }
   }
   ```

2. **Add `pool_strategy` variable** to `modules/runners/variables.tf`
   ```hcl
   variable "pool_strategy" {
     description = "Strategy for the pool lambda. 'hot' keeps runners running. 'warm' maintains stopped instances only."
     type        = string
     default     = "hot"
     validation {
       condition     = contains(["hot", "warm"], var.pool_strategy)
       error_message = "pool_strategy must be 'hot' or 'warm'."
     }
   }
   ```

3. **Add cross-variable validation** (lifecycle precondition or `check` block):
   - `pool_strategy = "warm"` requires `warm_pool_config.enabled = true`

4. **Create DynamoDB table** for warm pool state (`modules/runners/warm-pool.tf`):
   ```hcl
   resource "aws_dynamodb_table" "warm_pool" {
     count        = var.warm_pool_config.enabled ? 1 : 0
     name         = "${var.prefix}-warm-pool"
     billing_mode = "PAY_PER_REQUEST"
     hash_key     = "instanceId"

     attribute {
       name = "instanceId"
       type = "S"
     }

     attribute {
       name = "runnerOwner"
       type = "S"
     }

     attribute {
       name = "stoppedAt"
       type = "S"
     }

     global_secondary_index {
       name            = "by-owner"
       hash_key        = "runnerOwner"
       range_key       = "stoppedAt"
       projection_type = "ALL"
     }

     ttl {
       attribute_name = "expiresAt"
       enabled        = true
     }

     tags = local.tags
   }
   ```

   **Table schema:**

   | Attribute | Type | Purpose |
   |-----------|------|---------|
   | `instanceId` (PK) | String | EC2 instance ID |
   | `runnerOwner` (GSI PK) | String | GitHub org/repo owner (for filtering) |
   | `stoppedAt` (GSI SK) | String | ISO 8601 timestamp when stopped (for newest-first selection + age eviction) |
   | `environment` | String | Runner environment tag |
   | `runnerType` | String | `Org` or `Repo` |
   | `amiId` | String | AMI ID at time of stopping (for staleness check) |
   | `instanceType` | String | EC2 instance type |
   | `az` | String | Availability zone (instance can only restart in same AZ) |
   | `expiresAt` | Number | Unix epoch for DynamoDB TTL auto-deletion (set to `stoppedAt + max_warm_age_hours`) |

   DynamoDB TTL automatically cleans up stale records — no lambda logic needed for age-based eviction of the DB record itself. The scale-down lambda still terminates the actual EC2 instance.

5. **Add IAM permissions** to the Lambda execution roles:
   - `ec2:StopInstances` (scale-down lambda)
   - `ec2:StartInstances` (scale-up and pool lambdas)
   - `dynamodb:PutItem`, `dynamodb:DeleteItem`, `dynamodb:GetItem` (scale-down, scale-up, pool lambdas)
   - `dynamodb:Query` on GSI `by-owner` (scale-up and pool lambdas)
   - Condition on EC2 actions: `ec2:ResourceTag/ghr:Application = github-action-runner`
   - Condition on DynamoDB: resource ARN scoped to the warm pool table

6. **Pass environment variables** to all three lambdas:
   - `ENABLE_WARM_POOL` → `var.warm_pool_config.enabled`
   - `WARM_POOL_MAX_INSTANCES` → `var.warm_pool_config.max_warm_instances`
   - `WARM_POOL_MAX_AGE_HOURS` → `var.warm_pool_config.max_warm_age_hours`
   - `WARM_POOL_READY_DELAY_SECONDS` → `var.warm_pool_config.warm_pool_ready_delay_seconds` (pool lambda only)
   - `POOL_STRATEGY` → `var.pool_strategy` (pool lambda only)
   - `WARM_POOL_TABLE_NAME` → DynamoDB table name (all three lambdas)

7. **Wire through multi-runner module** (`modules/multi-runner/runners.tf`):
   - Add `warm_pool_config` and `pool_strategy` to the `multi_runner_config` object type
   - Pass through to the runners module

### Files Modified
- `modules/runners/variables.tf`
- `modules/runners/warm-pool.tf` (new — DynamoDB table + IAM)
- `modules/runners/scale-down.tf` (env vars)
- `modules/runners/scale-up.tf` (env vars)
- `modules/runners/pool/main.tf` (env vars)
- `modules/runners/policies/lambda-scale-down.json` (IAM — EC2 Stop + DynamoDB)
- `modules/runners/policies/lambda-scale-up.json` (IAM — EC2 Start + DynamoDB)
- `modules/multi-runner/variables.tf`
- `modules/multi-runner/runners.tf`

---

## Phase 2: Scale-Down — Stop Instead of Terminate

**Goal**: Idle pool runners are stopped instead of terminated when warm pool is enabled.

### Tasks

1. **Add `stopRunner()` function** to `lambdas/functions/control-plane/src/aws/runners.ts`:
   ```typescript
   export async function stopRunner(instanceId: string): Promise<void> {
     const ec2 = getTracedAWSV3Client(new EC2Client({ region: process.env.AWS_REGION }));
     await ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
   }
   ```

2. **Create `lambdas/functions/control-plane/src/aws/warm-pool.ts`** — DynamoDB client for warm pool state:
   ```typescript
   import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
   import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

   const client = DynamoDBDocumentClient.from(
     getTracedAWSV3Client(new DynamoDBClient({ region: process.env.AWS_REGION }))
   );
   const TABLE_NAME = process.env.WARM_POOL_TABLE_NAME;

   export interface WarmPoolEntry {
     instanceId: string;
     runnerOwner: string;
     runnerType: string;
     environment: string;
     stoppedAt: string;
     amiId: string;
     instanceType: string;
     az: string;
     expiresAt: number;
   }

   export async function addToWarmPool(entry: WarmPoolEntry): Promise<void> { ... }
   export async function removeFromWarmPool(instanceId: string): Promise<void> { ... }
   export async function getWarmRunners(runnerOwner: string): Promise<WarmPoolEntry[]> { ... }
   export async function getWarmPoolCount(runnerOwner: string): Promise<number> { ... }
   ```

   **Key operations:**
   - `addToWarmPool()` — PutItem after stopping an instance
   - `removeFromWarmPool()` — DeleteItem after starting or terminating a warm instance
   - `getWarmRunners()` — Query GSI `by-owner` with ScanIndexForward=false (newest first)
   - `getWarmPoolCount()` — Query with Select=COUNT for checking against max limit

3. **Modify `removeRunner()`** in `scale-down.ts`:
   - If `ENABLE_WARM_POOL=true`:
     - Query DynamoDB for current warm pool count (`getWarmPoolCount()`)
     - If under `WARM_POOL_MAX_INSTANCES`: deregister from GitHub → stop instance → `addToWarmPool()` with instance metadata
     - If at/over limit: terminate as today
     - Note: spot instances are stopped too (best-effort; if AWS reclaims them, scale-up handles gracefully)
   - If `ENABLE_WARM_POOL=false`: existing behavior (terminate)

4. **Add warm pool eviction** to `scaleDown()`:
   - After active runner evaluation, add warm pool cleanup phase:
   - Query DynamoDB for all warm entries for the environment
   - For each entry older than `WARM_POOL_MAX_AGE_HOURS`: terminate EC2 instance + `removeFromWarmPool()`
   - If total warm count > `WARM_POOL_MAX_INSTANCES`: terminate + remove oldest
   - Note: DynamoDB TTL will eventually auto-delete very stale records, but we actively terminate EC2 instances

5. **Add AMI staleness check**:
   - `amiId` is stored in DynamoDB when stopping
   - During eviction, compare stored `amiId` against current launch template AMI (passed as env var `LAUNCH_TEMPLATE_AMI_ID`)
   - If mismatched: terminate + remove from DynamoDB

### Files Modified
- `lambdas/functions/control-plane/src/aws/runners.ts` (`stopRunner()`)
- `lambdas/functions/control-plane/src/aws/warm-pool.ts` (new — DynamoDB client)
- `lambdas/functions/control-plane/src/scale-runners/scale-down.ts` (core logic)

### Tests
- Unit tests for `stopRunner()`
- Unit tests for DynamoDB warm pool operations (add, remove, query, count)
- Unit tests for warm pool eviction logic (age, count, AMI mismatch)
- Integration test: idle runner is stopped and DynamoDB record created
- Integration test: warm pool count cap is respected

---

## Phase 3: Scale-Up — Start Warm Instances

**Goal**: When a job is queued, start a warm instance before creating a new one.

### Tasks

1. **Add `startRunner()` function** to `runners.ts`:
   ```typescript
   export async function startRunner(instanceId: string): Promise<void> {
     const ec2 = getTracedAWSV3Client(new EC2Client({ region: process.env.AWS_REGION }));
     await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
   }
   ```

2. **Add `findAndStartWarmRunner()` function** to `scale-up.ts`:
   ```typescript
   export async function findAndStartWarmRunner(params: {
     environment: string;
     runnerOwner: string;
     runnerType: RunnerType;
   }): Promise<string | null> {
     // Query DynamoDB GSI 'by-owner' for runnerOwner, newest first (ScanIndexForward=false)
     // Pick the first (most recently stopped) entry
     // Call startRunner(entry.instanceId)
     // Remove entry from DynamoDB (removeFromWarmPool)
     // Tag instance with ghr:started-from-warm-pool=true
     // Return instanceId, or null if table is empty / start fails
   }
   ```

   **Why DynamoDB instead of DescribeInstances:**
   - Single-digit millisecond query latency vs. 100-500ms+ for DescribeInstances
   - No API rate limiting concerns (DynamoDB scales with PAY_PER_REQUEST)
   - Consistent reads — no eventual consistency window
   - GSI enables efficient filtering by owner without scanning all instances
   - Atomic deletes prevent race conditions (two scale-up invocations won't pick the same instance)

   **Handling stale DynamoDB entries (instance already terminated by AWS/spot reclaim):**
   - If `StartInstances` returns `InvalidInstanceID.NotFound` or instance is in `terminated` state → delete DynamoDB record, try next entry
   - This self-heals any drift between DynamoDB and actual EC2 state

3. **Modify `scaleUpHandler()`** in `scale-up.ts`:
   - Before calling `createRunners()`, attempt `findAndStartWarmRunner()`
   - Decrement `numberOfRunners` needed for each warm instance started
   - If all needed runners filled from warm pool, skip fleet creation entirely
   - On `StartInstances` failure: log warning, fall through to cold launch

4. **Handle startup script re-registration**:
   - The existing `start-runner.sh` / user-data script runs on boot
   - On a **restarted** instance, it must:
     - Detect it's a warm-pool restart (check `ghr:started-from-warm-pool` tag via instance metadata or a marker file)
     - Re-fetch a registration token from GitHub
     - Re-register the runner
   - This may require a minor change to the startup script or a systemd unit that triggers on boot

### Files Modified
- `lambdas/functions/control-plane/src/aws/runners.ts` (`startRunner()`)
- `lambdas/functions/control-plane/src/aws/warm-pool.ts` (query logic)
- `lambdas/functions/control-plane/src/scale-runners/scale-up.ts` (integration)
- `images/start-runner.sh` (handle restart case)

### Tests
- Unit test: warm runner is started before new creation (DynamoDB queried first)
- Unit test: if DynamoDB is empty, falls through to createRunners
- Unit test: stale DynamoDB entry (terminated instance) is deleted and next entry tried
- Unit test: warm runner count decrements needed runners
- Unit test: concurrent scale-up invocations don't pick same instance (conditional delete)
- E2E test: job triggers warm start, runner registers, job completes

---

## Phase 4: Pool Lambda — Warm-Only Strategy

**Goal**: Pool lambda can maintain stopped (warm) instances instead of running ones, enabling zero idle compute.

### Tasks

1. **Modify `adjust()` in pool.ts** to check `POOL_STRATEGY` env var:
   - If `POOL_STRATEGY=hot` (default):
     - Before creating new running instances, check for warm instances and start them first
     - Create remaining deficit as new running instances (current behavior + warm preference)
   - If `POOL_STRATEGY=warm`:
     - Target pool size refers to **warm** (stopped) instances
     - Count existing warm (stopped) instances
     - If below target: create new instances, let them boot + register with GitHub
     - **Wait `WARM_POOL_READY_DELAY_SECONDS`** (default 30s) before evaluating
     - After the delay: check if runner is busy (picked up a job) — if busy, leave it alone
     - If still idle after delay: deregister from GitHub + stop instance + tag as warm
     - If above target: do nothing (scale-down eviction handles excess)
     - No permanently running idle instances are maintained

2. **Add grace period logic** (for `POOL_STRATEGY=warm`):
   - After creating/starting instances, wait `WARM_POOL_READY_DELAY_SECONDS`
   - Query GitHub API for each runner's busy state
   - Only stop runners that are confirmed idle after the grace window
   - Runners that picked up a job during the window continue running normally
   - This prevents unnecessary stop/start cycles when jobs arrive during pool top-up

3. **Pass `POOL_STRATEGY` and `WARM_POOL_READY_DELAY_SECONDS` env vars** from Terraform to pool lambda

### Files Modified
- `lambdas/functions/control-plane/src/pool/pool.ts`

### Tests
- Unit test: pool prefers warm instances (hot strategy)
- Unit test: pool creates new when no warm instances available
- Unit test: warm strategy — instance stopped after grace period when idle
- Unit test: warm strategy — instance NOT stopped if it picked up a job during grace window
- Unit test: warm strategy — `ghr:warm-pool-grace-hit` tag set on grace window job pickup

---

## Phase 5: Observability & Metrics

**Goal**: Operators can monitor warm pool behavior.

### Tasks

1. **CloudWatch metrics** (via existing PowerTools integration):
   - `WarmPoolSize` — current number of stopped warm instances
   - `WarmPoolStarts` — count of instances started from warm pool
   - `WarmPoolGraceHits` — count of instances that picked up a job during grace window
   - `WarmPoolEvictions` — count of warm instances terminated (age/cap/AMI)
   - `WarmPoolStartLatency` — time from start API call to instance running

2. **Logging**:
   - All warm pool operations logged with structured fields
   - `source: 'warm-pool'` field for easy filtering

3. **Tags for cost allocation**:
   - `ghr:warm-pool=true` enables cost explorer filtering
   - Operators can see EBS costs attributed to warm pool

### Files Modified
- All lambda source files (metric emissions)
- Terraform outputs for CloudWatch dashboard (optional)

---

## Phase 6: Documentation & Multi-Runner Integration

**Goal**: Feature is documented and fully integrated with multi-runner module.

### Tasks

1. Update `docs/configuration.md` with warm pool section
2. Add example in `examples/multi-runner/` showing warm pool config
3. Update `modules/runners/scale-down-state-diagram.md` with new states
4. Add CHANGELOG entry

---

## Sequencing & Dependencies

```
Phase 1 (Foundation)
   ↓
Phase 2 (Scale-Down: Stop)  ←  can be deployed independently
   ↓
Phase 3 (Scale-Up: Start)   ←  requires Phase 2 (needs warm instances to exist)
   ↓
Phase 4 (Pool: Start)       ←  requires Phase 2
   ↓
Phase 5 (Observability)     ←  can run in parallel with Phase 3/4
   ↓
Phase 6 (Docs)              ←  after all phases
```

## Key Design Decisions

### Why DynamoDB instead of EC2 DescribeInstances?

The existing codebase uses `DescribeInstances` with tag filters to discover runner state. This works for the current scale but has fundamental problems:

| Concern | DescribeInstances | DynamoDB |
|---------|------------------|----------|
| Latency | 100-500ms+ per call | Single-digit ms |
| Rate limits | 100 calls/sec shared across all EC2 API usage | Effectively unlimited (PAY_PER_REQUEST) |
| Consistency | Eventually consistent | Strongly consistent reads available |
| Race conditions | Two lambdas can pick same instance | Conditional deletes prevent double-claim |
| Filtering | Tag filters are slow at scale | GSI gives instant owner-based lookup |
| Cost | Free (but rate-limited) | ~$1.25 per million requests |

For the warm pool specifically, the scale-up lambda is on the **hot path** — every millisecond of delay adds to job queue time. A DynamoDB query returning available warm instances in <5ms is critical for the feature's value proposition.

**Future migration note**: The existing `listEC2Runners()` calls in scale-down and pool lambdas also suffer from these DescribeInstances limitations. DynamoDB can eventually replace those too, with the warm pool table serving as the pattern/proof-of-concept.

### Why deregister from GitHub before stopping?

A stopped runner cannot respond to GitHub health checks. If left registered, GitHub would mark it offline/stale. Deregistering cleanly and re-registering on start is the correct lifecycle.

### Why newest-first for warm pool selection?

The most recently stopped instance has the freshest state (packages, Docker cache, etc.). Starting it minimizes stale-state risk.

### What about spot instances in warm pool?

The warm pool uses whatever capacity type the runner config specifies — including spot. This means stopped spot instances may be reclaimed by AWS at any time. If a warm spot instance is reclaimed, the scale-up lambda simply falls through to cold-launching a new instance. This is acceptable because:

- The warm pool is a best-effort optimization, not a guarantee
- Most of the time, stopped spot instances are not reclaimed immediately
- The fallback (cold launch) is the same behavior as today without warm pool

**Future enhancement**: A `warm_pool_capacity_type_override` setting will allow forcing on-demand for pool-created instances even when the runner config uses spot. This gives users cheap spot for reactive scale-up while maintaining a reliable warm pool on on-demand.

### What about the `idle_config` interaction?

The `idle_config` still controls how many runners remain **running** (hot) when `pool_strategy = "hot"`. With `pool_strategy = "warm"`, the `idle_config` becomes irrelevant for pool runners since none are kept running.

Summary of interactions:

| `pool_strategy` | `idle_config.idleCount` | `warm_pool_config.max_warm_instances` | Result |
|-----------------|------------------------|--------------------------------------|--------|
| `hot` | 2 | 3 | 2 running idle + up to 3 stopped warm |
| `warm` | _(ignored)_ | 5 | 0 running idle + up to 5 stopped warm |

The `pool_strategy = "warm"` mode is ideal for users who:
- Want zero idle compute cost
- Accept 10-30s startup latency for the first job
- Have expensive instance types where idle cost is significant

### What about EBS encryption?

Stopped instances retain their encrypted EBS volumes. No change needed — encryption is controlled by the launch template and works identically for stopped instances.

## Estimated Complexity

| Phase | Effort | Risk |
|-------|--------|------|
| 1 - Foundation | Low | Low (config only) |
| 2 - Scale-Down | Medium | Medium (core logic change) |
| 3 - Scale-Up | Medium | Medium (startup script changes) |
| 4 - Pool | Low | Low (reuses Phase 3 logic) |
| 5 - Observability | Low | Low |
| 6 - Docs | Low | Low |
