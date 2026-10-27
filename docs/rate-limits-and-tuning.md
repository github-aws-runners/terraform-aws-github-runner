# Rate Limits and Batch Size Tuning

Rate limits from both GitHub and AWS constrain how fast this module can scale runners. This guide documents the relevant limits, how `batch_size` interacts with them, and which AWS quotas to raise for larger deployments.

## GitHub API Rate Limits

### Primary rate limits

| Bucket | Limit | Scaling | Used by |
|---|---|---|---|
| `core` | 5,000 req/hour (base) | +50/user over 20, +50/repo over 20, max 12,500 | Token minting, `isJobQueued`, `listSelfHostedRunners` |
| `actions_runner_registration` | 10,000 req/hour | Fixed | JIT config generation |

GHEC orgs may have a higher `core` base (10,000+).

### Secondary rate limits

These apply in addition to primary limits, regardless of authentication method:

| Constraint | Limit |
|---|---|
| Concurrent requests | **100** (shared across all REST + GraphQL endpoints) |
| Points per endpoint per minute | **900** (REST), **2,000** (GraphQL) |
| CPU time | 90s CPU per 60s real time |
| Content creation | 80 requests/min, 500/hour |

#### Point costs

[Source: GitHub docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#calculating-points-for-the-secondary-rate-limit)

| Request type | Points |
|---|---|
| `GET`, `HEAD`, `OPTIONS` | 1 |
| `POST`, `PATCH`, `PUT`, `DELETE` | 5 |

Some REST API endpoints have a different point cost that is not shared publicly.

### Request failover and retries

Control-plane GitHub requests try another eligible App when a rate limit is reached, including job checks, registration-token requests, JIT configuration, and scale-down operations. Each App is tried at most once per operation. Primary quotas are tracked separately by resource and installation owner; secondary cooldowns apply across the App.

This changes single-App behavior too: the throttling plugin no longer waits inside the Lambda for quota to reset. When no App is eligible, the operation fails promptly. Scale-up and job-retry queue consumers report failed records for SQS redelivery; scheduled pool and scale-down invocations can try again on their next run.

In job-retry, permanent GitHub authentication or job-status errors (400, 401, non-rate-limit 403, 404, 410, and 422) are logged and acknowledged instead of repeatedly redelivered until queue retention expires. Rate limits, network failures, server errors, and queue publication failures remain retryable.

The job-retry event source enables `ReportBatchItemFailures`. Retryable authentication failures, job-status checks (including 5xx and timeouts), and queue publications return only their failed message IDs. Successfully processed records are acknowledged. A failed status check is retried before deciding whether to publish a scale-up request; it is not treated as evidence that the job is still queued. SQS remains an at-least-once service, so partial batch responses do not guarantee exactly-once processing.

### Maximum runner creation rate per App

With an installation token cache (token mints ≈ 0 per runner), the per-runner API cost is:

| API call | Method | Points | Bucket |
|---|---|---|---|
| `isJobQueued` | GET | 1 | `core` |
| `generateRunnerJitconfigForOrg` | POST | 5 | `actions_runner_registration` |

**Bottleneck: JIT config generation** — 900 points ÷ 5 points/call = **180 runners/minute** (burst).

Sustained: 10,000/hour ÷ 60 = **~166 runners/minute**.

Without a token cache, each runner also costs a `POST /app/installations/{id}/access_tokens` (5 points) against the `core` endpoint. This doesn't directly reduce JIT throughput (different endpoint) but competes with `isJobQueued` for the `core` hourly budget.

### Distributing load across multiple GitHub Apps

Configure extra Apps with `additional_github_apps` to distribute API traffic. Scale-up, pool, scale-down, and job-retry clients select the eligible App with the highest recently observed remaining budget before each request, tracking primary resources separately once reported by GitHub. Selection state is local to a warm Lambda execution environment, not a globally synchronized quota measurement. Unknown or expired observations are explored with randomized tie-breaking; observations expire at the reported reset time, or after one minute without a reset header.

Every HTTP 429 and rate-limit-specific 403 triggers bounded failover, including responses with nonzero primary quota remaining. The failed App is excluded until `Retry-After` or the primary reset deadline (with a one-second margin), defaulting to 60 seconds when neither is usable. The client resolves the replacement App's own installation and retries only the failed GitHub operation. Installation lookup and token minting use the same failover policy. Successful runner registrations and compute-provider operations are not replayed.

Each App is attempted at most once per operation. If no eligible App remains, the error is returned to the caller's existing failure/retry path instead of sleeping through the Lambda timeout or ignoring cooldowns. Ordinary permission, authentication, and validation failures do not trigger app switching. Secondary limits can still affect multiple Apps; adding Apps does not guarantee linearly increasing throughput or replace concurrency control.

> [!IMPORTANT]
> Every additional App must be installed on the same organizations or repositories as the primary App. The module cannot verify this. A missing installation surfaces at runtime as installation lookup 404s on the fraction of invocations that select the misconfigured App, which is hard to trace back to the installation.

Only the primary App needs a webhook configured in GitHub; additional Apps are used for API calls only. Set `installation_id` per additional App to skip one installation lookup per invocation.

The lambdas receive additional App credentials through a manifest SSM parameter that lists the per-App credential parameter names, so the lambda environment size stays constant regardless of App count.

### GHES

Rate limits are **disabled by default** on GitHub Enterprise Server and must be explicitly enabled by the site admin. When enabled, the same formula applies.

### API calls per scale-up invocation

| API call | Bucket | Frequency |
|---|---|---|
| `POST /app/installations/{id}/access_tokens` | `core` | 1 per unique installation in batch (0 with token cache) |
| `GET /actions/jobs/{id}` (isJobQueued) | `core` | 1 per message (if `enable_job_queued_check = true`) |
| `POST /actions/runners/generate-jitconfig` | `actions_runner_registration` | 1 per instance created |
| `GET /actions/runners` (listSelfHostedRunners) | `core` | Scale-down, pool |

### Incremental scale-down API cost

EC2 scale-down processes up to 100 instances per inventory page and looks up GitHub registrations individually by ID or exact name. This lets cleanup begin before the whole fleet is listed, but increases GitHub requests compared with the former owner-wide cached listing. A name lookup may itself paginate. An ID lookup returning 404 triggers a paginated owner listing to confirm absence, since failover can select another App with different access. A registration found in that listing remains subject to its current busy state; incomplete or failed verification retains the instance. Eligible removals also recheck busy state and delete the registration; authentication and orphan rechecks add requests.

For a scan of N eligible instances every T minutes, identity lookups alone can approach `N × 60 / T` requests per hour. For example, 1,000 instances scanned every five minutes can require about 12,000 identity requests per hour, before removals or other scaling traffic. Retained instances may be checked again each run. Monitor App quota and throttling, choose a schedule that leaves room for scale-up/pool traffic, and configure additional Apps when appropriate.

The EC2 inventory page size is 100: approximately ten `DescribeInstances` requests for 1,000 returned instances, excluding retries. These calls share EC2 API limits with other scaling operations. Page processing remains incremental, with a deadline check before new pages and runners; no scan progress is persisted.

## AWS Rate Limits

### SSM Parameter Store

| Metric | Default |
|---|---|
| Combined throughput (Get + Put) | **40 TPS** (shared per-account per-region) |

Each runner instance requires one `PutParameter` call for its JIT config. At 40 TPS shared across all operations in the account, a burst of 40+ concurrent writes will throttle.

**Higher throughput mode** raises the ceiling:

```bash
aws ssm update-service-setting \
  --setting-id arn:aws:ssm:<region>:<account-id>:servicesetting/ssm/parameter-store/high-throughput-enabled \
  --setting-value true
```

Cost: $0.05 per 10,000 API interactions beyond the standard tier.

### EC2 CreateFleet

The exact TPS limit for `CreateFleet` is not publicly documented. It uses a token-bucket algorithm per-account per-region. Empirically throttles at low single-digit TPS.

When throttled: HTTP 503, error code `RequestLimitExceeded`.

**To request an increase:** Open an AWS Support case (Support Center → Create case → Service limit increase → EC2). EC2 API rate limits are not available in the Service Quotas console.

## AWS Service Quotas

For deployments running more than a handful of concurrent runners:

| Quota | Default | How to raise |
|---|---|---|
| Running On-Demand Standard (A,C,D,H,I,M,R,T,Z) instances | **5 vCPUs** | Service Quotas console |
| All Standard Spot Instance Requests | **5 vCPUs** | Service Quotas console |
| EC2 CreateFleet API rate | Undocumented | AWS Support ticket |
| SSM Parameter Store throughput | 40 TPS | `update-service-setting` (see above) |

**vCPU quotas are measured in vCPUs, not instance count.** Running 50× `c5.large` (2 vCPU each) requires a quota of at least 100 vCPUs.

## Tuning `batch_size`

`lambda_event_source_mapping_batch_size` controls how many SQS messages are delivered to a single Lambda invocation (default: 10).

### What batch_size affects

| Resource | batch_size=1 (100 jobs) | batch_size=10 (100 jobs) |
|---|---|---|
| Lambda invocations | 100 | 10 |
| `CreateFleet` calls | 100 | 10 |
| Token mints (without cache) | 100 | 10 (deduped per installation within batch) |
| Token mints (with cache) | ~1 | ~1 |
| `PutParameter` calls (JIT config) | 100 | 100 (same total) |
| `isJobQueued` calls | 100 | 100 (same total) |
| JIT config generation calls | 100 | 100 (same total) |

Larger `batch_size` reduces CreateFleet calls (the most constrained AWS API) and Lambda invocations. Per-runner work (SSM writes, JIT config, isJobQueued) stays the same total. SSM peak TPS is lower with larger batches because writes are serialized within each Lambda rather than concurrent across many.

### Tradeoffs

| batch_size | Pros | Cons |
|---|---|---|
| 1 | Simple, failures affect only one job | Most CreateFleet calls, highest EC2 API pressure |
| 5–10 | Fewer CreateFleet calls, lower peak TPS on EC2/SSM | Longer Lambda execution, partial failures affect more jobs |

### `maximum_batching_window_in_seconds`

When `batch_size > 1`, Lambda waits up to this many seconds to fill the batch before invoking.

| Setting | Behavior |
|---|---|
| 0 (default) | Invoke immediately with available messages |
| 5–10s | Accumulate messages, fewer invocations, better batching |

Higher windows improve batching efficiency but add latency to job pickup.

### Recommendations

| Deployment size | batch_size | Lambda timeout | Other actions |
|---|---|---|---|
| Small (<50 concurrent jobs) | 1–5 | 90s | Defaults work |
| Medium (50–200) | 5–10 | 180s | Monitor SSM throttling |
| Large (200+) | 10 | 300s | Enable SSM higher throughput, raise vCPU quotas, request CreateFleet rate increase |

## Monitoring

| What to watch | Source | Alert threshold |
|---|---|---|
| SSM `ThrottlingException` | CloudWatch Logs (scale-up Lambda) | Any sustained occurrence |
| `GitHubAppRateLimitRemaining` | Custom metric (`metrics.enable = true`) | < 1000 remaining |
| Lambda duration | scale-up Lambda CloudWatch metrics | > 80% of configured timeout |
| `ApproximateAgeOfOldestMessage` | SQS build queue | > 60s |
| DLQ message count | Dead letter queue | > 0 |
| EC2 `RequestLimitExceeded` | CloudTrail | Any occurrence |
