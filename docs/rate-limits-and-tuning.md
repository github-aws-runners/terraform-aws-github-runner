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

### Maximum runner creation rate per App

With an installation token cache (token mints ≈ 0 per runner), the per-runner API cost is:

| API call | Method | Points | Bucket |
|---|---|---|---|
| `isJobQueued` | GET | 1 | `core` |
| `generateRunnerJitconfigForOrg` | POST | 5 | `actions_runner_registration` |

**Bottleneck: JIT config generation** — 900 points ÷ 5 points/call = **180 runners/minute** (burst).

Sustained: 10,000/hour ÷ 60 = **~166 runners/minute**.

Without a token cache, each runner also costs a `POST /app/installations/{id}/access_tokens` (5 points) against the `core` endpoint. This doesn't directly reduce JIT throughput (different endpoint) but competes with `isJobQueued` for the `core` hourly budget.

### GHES

Rate limits are **disabled by default** on GitHub Enterprise Server and must be explicitly enabled by the site admin. When enabled, the same formula applies.

### API calls per scale-up invocation

| API call | Bucket | Frequency |
|---|---|---|
| `POST /app/installations/{id}/access_tokens` | `core` | 1 per unique installation in batch (0 with token cache) |
| `GET /actions/jobs/{id}` (isJobQueued) | `core` | 1 per message (if `enable_job_queued_check = true`) |
| `POST /actions/runners/generate-jitconfig` | `actions_runner_registration` | 1 per instance created |
| `GET /actions/runners` (listSelfHostedRunners) | `core` | Scale-down, pool |

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
