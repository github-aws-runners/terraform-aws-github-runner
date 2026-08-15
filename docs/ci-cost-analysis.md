# Annual PR Testing Cost Analysis — AWS Platform

> **Last updated:** June 2026  
> **Scope:** Estimated AWS infrastructure costs for running full integration tests on every PR, broken down by change type, with routing logic to match test scope to the code being changed.

---

## Overview

This document estimates the annual AWS cost of running comprehensive, path-aware integration tests for every pull request in this repository. The current CI pipeline validates Terraform syntax, lints lambdas, and runs unit tests — all using GitHub-hosted runners with no real AWS infrastructure provisioned. The analysis below covers what it would cost to extend that to **live AWS integration tests** that deploy and exercise real infrastructure for each affected component.

---

## PR Volume Baseline

Based on the repository's CHANGELOG history and merged PR numbering:

| Metric | Estimate |
|---|---|
| Current PR number (June 2026) | ~5,172 |
| PR number range over last 12 months | ~4,350 → 5,172 |
| **Estimated PRs per year** | **~820** |
| Working days per year | ~250 |
| Average PRs per day | ~3.3 |

### PR Composition

| Category | Estimated % | PRs/year | Primary path(s) touched |
|---|---|---|---|
| Dependabot — Lambda dependency bumps | 55% | ~450 | `lambdas/**` |
| Dependabot — GitHub Actions version bumps | 12% | ~100 | `.github/workflows/**` |
| Lambda feature / bug fixes | 13% | ~107 | `lambdas/**` |
| Terraform module changes | 10% | ~82 | `modules/**`, root `*.tf` |
| Multi-runner specific changes | 4% | ~33 | `modules/multi-runner/**`, `examples/multi-runner/**` |
| Packer / image changes | 3% | ~25 | `images/**` |
| Docs / misc | 3% | ~25 | `docs/**`, other |

---

## Test Suites and Trigger Matrix

Each test suite maps to one or more repository path prefixes. A PR triggers only the suites relevant to the files it changes.

### Defined Test Suites

| Suite ID | Name | Description | Avg. Duration |
|---|---|---|---|
| **L-UNIT** | Lambda Unit Tests | Build, lint, and unit-test all five Lambda functions in a container | 10 min |
| **L-INT** | Lambda Integration Tests | Deploy Lambdas to a shared test AWS account; invoke real SQS/SNS/SSM workflows | 20 min |
| **TF-VALIDATE** | Terraform Validate + TFLint | `terraform validate` and `tflint` across all modules and examples | 8 min |
| **RUNNER-DEFAULT** | Default Runner Stack | `terraform apply` the `examples/default` stack; register a runner; run a test job; destroy | 25 min |
| **RUNNER-PREBUILT** | Prebuilt Runner Stack | Same cycle for `examples/prebuilt` (pre-baked AMI path) | 25 min |
| **RUNNER-EPHEMERAL** | Ephemeral Runner Stack | Same cycle for `examples/ephemeral` | 25 min |
| **RUNNER-MULTI** | Multi-Runner Stack | Deploy `examples/multi-runner` with all 3–5 runner-type configs; validate each queue routes correctly | 40 min |
| **RUNNER-TERMWATCHER** | Termination Watcher | Deploy `examples/termination-watcher`; trigger a spot-interruption simulation; verify cleanup | 30 min |
| **AMI-BUILD** | Packer AMI Builds | Build all six image types (`linux-al2023`, `ubuntu-focal`, `ubuntu-jammy`, `ubuntu-jammy-arm64`, `windows-core-2019`, `windows-core-2022`) in parallel | 60 min |
| **AMI-HOUSEKEEPER** | AMI Housekeeper | Deploy the `ami-housekeeper` module and verify deregistration/snapshot cleanup logic | 20 min |

### Path → Suite Trigger Map

| Changed path prefix | Suites triggered |
|---|---|
| `lambdas/**` | L-UNIT, L-INT |
| `.github/workflows/**` | TF-VALIDATE *(syntax only)* |
| `modules/webhook/**` | L-INT, RUNNER-DEFAULT, RUNNER-MULTI |
| `modules/runners/**` | RUNNER-DEFAULT, RUNNER-PREBUILT, RUNNER-EPHEMERAL, RUNNER-TERMWATCHER |
| `modules/multi-runner/**` | RUNNER-MULTI, RUNNER-DEFAULT |
| `modules/lambda/**` | L-INT, RUNNER-DEFAULT |
| `modules/runner-binaries-syncer/**` | L-INT |
| `modules/termination-watcher/**` | RUNNER-TERMWATCHER |
| `modules/ami-housekeeper/**` | AMI-HOUSEKEEPER |
| `modules/ssm/**` | L-INT |
| `modules/setup-iam-permissions/**` | RUNNER-DEFAULT |
| `images/**` | AMI-BUILD |
| Root `*.tf` / `**/*.hcl` | TF-VALIDATE |
| `examples/**` | TF-VALIDATE + relevant RUNNER-* suite |

---

## AWS Resource Costs per Test Suite

All prices are based on **us-east-1 on-demand rates** as of Q2 2026. Adjust for your region.

### Shared / Persistent Test Infrastructure

A dedicated AWS test account is assumed with a standing VPC:

| Resource | Monthly cost | Annual cost |
|---|---|---|
| VPC + 1 NAT Gateway (fixed + ~10 GB/month data) | $36 | $432 |
| S3 bucket (Terraform state + Lambda ZIPs) | $2 | $24 |
| CloudWatch Log Groups (30-day retention) | $6 | $72 |
| ECR repository (built Lambda images) | $1 | $12 |
| IAM roles, SSM parameters (free tier) | $0 | $0 |
| **Persistent subtotal** | **$45/month** | **$540/year** |

### Per-Run Variable Costs

#### L-INT — Lambda Integration Tests

| Resource | Usage per run | Unit price | Cost per run |
|---|---|---|---|
| Lambda invocations | ~500 invocations | $0.20/1M | ~$0.00 |
| Lambda duration | ~10 GB-seconds | $0.0000166667/GB-s | ~$0.00 |
| SQS messages | ~200 messages | $0.40/1M | ~$0.00 |
| SSM GetParameter calls | ~50 calls | Free tier | ~$0.00 |
| CloudWatch Logs ingestion | ~50 MB | $0.50/GB | ~$0.03 |
| **L-INT total** | | | **~$0.05** |

#### RUNNER-DEFAULT / PREBUILT / EPHEMERAL (per stack)

| Resource | Usage per run | Unit price | Cost per run |
|---|---|---|---|
| EC2 `c5.large` (runner instance, 20 min) | 0.33 hr | $0.085/hr | $0.028 |
| EC2 `t3.small` (optional bastion, 15 min) | — | — | — |
| Terraform apply/destroy API calls | ~1,000 API calls | Free (IAM/EC2 control plane) | ~$0.00 |
| NAT Gateway data transfer | ~100 MB | $0.045/GB + $0.045/hr | ~$0.01 |
| CloudWatch Logs ingestion | ~30 MB | $0.50/GB | ~$0.02 |
| S3 state reads/writes | ~50 requests | $0.005/1k requests | ~$0.00 |
| **Per runner stack total** | | | **~$0.06** |

#### RUNNER-MULTI — Multi-Runner Stack

| Resource | Usage per run | Unit price | Cost per run |
|---|---|---|---|
| 5 × EC2 `c5.large` runner instances (avg. 20 min each) | 5 × 0.33 hr | $0.085/hr | $0.14 |
| NAT Gateway data transfer | ~300 MB | $0.045/GB | $0.01 |
| SQS queues (5 runner queues × test messages) | ~1,000 messages | $0.40/1M | ~$0.00 |
| CloudWatch Logs ingestion | ~100 MB | $0.50/GB | ~$0.05 |
| **RUNNER-MULTI total** | | | **~$0.21** |

#### RUNNER-TERMWATCHER — Termination Watcher

| Resource | Usage per run | Unit price | Cost per run |
|---|---|---|---|
| EC2 `c5.large` (spot interruption simulation, 20 min) | 0.33 hr | $0.085/hr | $0.028 |
| EventBridge + Lambda invocations | ~20 | negligible | ~$0.00 |
| CloudWatch Logs | ~20 MB | $0.50/GB | ~$0.01 |
| **RUNNER-TERMWATCHER total** | | | **~$0.04** |

#### AMI-BUILD — Packer Builds (all 6 images in parallel)

| Image | Instance type | Build time | On-demand price | Cost |
|---|---|---|---|---|
| `linux-al2023` | `c5.large` | 20 min | $0.085/hr | $0.028 |
| `ubuntu-focal` | `c5.large` | 25 min | $0.085/hr | $0.035 |
| `ubuntu-jammy` | `c5.large` | 25 min | $0.085/hr | $0.035 |
| `ubuntu-jammy-arm64` | `m6g.large` | 30 min | $0.077/hr | $0.039 |
| `windows-core-2019` | `m5.large` | 55 min | $0.096/hr | $0.088 |
| `windows-core-2022` | `m5.large` | 55 min | $0.096/hr | $0.088 |
| AMI snapshot storage (EBS, 7-day retention) | — | — | $0.05/GB-mo | ~$0.02 |
| **AMI-BUILD total (parallel)** | | | | **~$0.33** |

#### AMI-HOUSEKEEPER — AMI Housekeeper

| Resource | Usage per run | Unit price | Cost per run |
|---|---|---|---|
| Lambda invocations + EC2 describe/deregister API calls | ~100 calls | Free tier / negligible | ~$0.00 |
| CloudWatch Logs | ~10 MB | $0.50/GB | ~$0.01 |
| **AMI-HOUSEKEEPER total** | | | **~$0.01** |

---

## Annual Cost by PR Category

### Cost per PR by category

| PR Category | Suites triggered | Cost per PR |
|---|---|---|
| Dependabot — Lambda deps | L-UNIT, L-INT | ~$0.05 |
| Dependabot — Actions bumps | TF-VALIDATE | ~$0.00 |
| Lambda feature/fix | L-UNIT, L-INT | ~$0.05 |
| Terraform module (runners) | TF-VALIDATE, RUNNER-DEFAULT, RUNNER-PREBUILT, RUNNER-EPHEMERAL | ~$0.18 |
| Multi-runner changes | TF-VALIDATE, RUNNER-MULTI, RUNNER-DEFAULT | ~$0.28 |
| Packer / image changes | AMI-BUILD | ~$0.33 |
| Termination watcher changes | TF-VALIDATE, RUNNER-TERMWATCHER | ~$0.05 |
| AMI housekeeper changes | TF-VALIDATE, AMI-HOUSEKEEPER | ~$0.02 |
| Root terraform / general modules | TF-VALIDATE, RUNNER-DEFAULT | ~$0.07 |

### Annual Variable Cost Rollup

| PR Category | PRs/year | Cost/PR | Annual cost |
|---|---|---|---|
| Dependabot — Lambda deps | 450 | $0.05 | $22.50 |
| Dependabot — Actions bumps | 100 | $0.00 | $0.00 |
| Lambda feature/fix | 107 | $0.05 | $5.35 |
| Terraform / module changes | 60 | $0.18 | $10.80 |
| Multi-runner changes | 33 | $0.28 | $9.24 |
| Packer / image changes | 25 | $0.33 | $8.25 |
| Termination watcher / AMI HK / misc | 45 | $0.05 | $2.25 |
| **Variable subtotal** | **820** | | **~$58.39** |

### Total Annual AWS Cost Summary

| Cost bucket | Annual estimate |
|---|---|
| Persistent test infrastructure (VPC, S3, CW, ECR) | $540 |
| Variable per-PR test costs | $58 |
| Buffer / overrun / re-runs (~20% on variable) | $12 |
| **Total (excl. Mac runners)** | **~$610/year** |

---

## Mac Runners — Special Consideration

The `examples/dedicated-mac-hosts` example requires `mac2.metal` or `mac1.metal` instances. AWS **enforces a 24-hour minimum allocation** for Dedicated Mac hosts:

| Instance type | On-demand rate | 24-hour minimum | Cost per test |
|---|---|---|---|
| `mac1.metal` (Intel) | $24.00/hr | 24 hr | **$576** |
| `mac2.metal` (M1) | $21.00/hr | 24 hr | **$504** |
| `mac2-m2.metal` (M2) | $26.00/hr | 24 hr | **$624** |

**Recommendation:** Do **not** run Mac integration tests on every PR. Instead:

| Frequency | Mac cost/year | Total annual (incl. base) |
|---|---|---|
| Never (skip Mac) | $0 | **~$610/year** |
| Monthly scheduled run (1 mac2.metal host) | $6,048 | **~$6,658/year** |
| Quarterly scheduled run (1 mac2.metal host) | $2,016 | **~$2,626/year** |
| Per-PR (for `examples/dedicated-mac-hosts` PRs only, ~5/year) | $2,520 | **~$3,130/year** |

The most cost-effective approach that still validates Mac support is a **quarterly** or **release-gated** Mac test run.

---

## Cost Optimization Strategies

1. **Path-based triggering (already described above):** Never run a full matrix when only a single module changed. This is the single biggest lever — a naive "run everything on every PR" approach would cost ~10× more.

2. **Spot instances for runner test EC2s:** Replace `c5.large` on-demand ($0.085/hr) with Spot (~$0.025–0.035/hr). This cuts EC2 costs by ~60% on Linux instances. Windows Spot savings are smaller (~30%).

3. **Ephemeral stacks with fast destroy:** Use targeted `terraform destroy -target` instead of full stack teardown to reduce API call count and wall-clock time by ~40%.

4. **Shared test VPC:** A single VPC with pre-created subnets and security groups eliminates per-PR VPC provisioning, saving ~3–5 min of apply time and VPC Flow Log costs.

5. **Lambda integration test parallelism:** Run all five Lambda function integration tests in parallel in one shared account, not one account per Lambda.

6. **S3 + Terraform state locking via DynamoDB:** Use a single shared S3 bucket + DynamoDB table for all CI state files. Cost is negligible and prevents state conflicts.

7. **Reserved / Savings Plans for NAT Gateway:** If the test VPC runs 24/7, an AWS Compute Savings Plan reduces costs by up to 17%.

8. **AMI retention policy:** Deregister CI-built AMIs after 24–48 hours. Each AMI snapshot is ~8–40 GB; retaining them for a week wastes ~$5–20/month.

---

## Assumptions and Caveats

- **Prices** are us-east-1 on-demand as of Q2 2026. Spot or Savings Plan pricing would reduce variable costs by 30–60%.
- **PR count** is derived from the repository's CHANGELOG PR numbering: ~820 PRs/year. High-velocity periods (e.g., security embargo releases) may temporarily double the rate.
- **No GitHub Actions runner costs** are included for the CI orchestration layer itself — this repo is public, so GitHub-hosted runners are free for open-source projects. If moved to a private repo or using self-hosted runners for the CI orchestration, add approximately $0.008/min × average job minutes.
- **Terraform apply/destroy** durations above are estimates based on the module complexity (number of resources). Real durations vary with AWS API latency.
- **Integration test depth** is assumed to be a minimal "deploy → smoke test → destroy" cycle, not a full functional test suite. Deeper testing (load tests, chaos engineering) would multiply EC2 costs accordingly.
- **Mac runner costs** are based on Dedicated Host pricing. If AWS releases on-demand Mac instances without a minimum commitment in the future, this estimate would change significantly.

---

## Recommended Budget

| Scenario | Annual estimate |
|---|---|
| ✅ **Recommended: path-triggered integration tests, no Mac** | **~$610/year** |
| 🔁 Add quarterly Mac validation | **~$2,626/year** |
| 🔁 Add monthly Mac validation | **~$6,658/year** |
| ⚠️ Naive full-matrix on every PR (no path filtering) | **~$4,200/year** |

The **~$610/year** figure (≈ $51/month) covers full integration testing of every PR against real AWS infrastructure with path-aware routing, shared persistent infrastructure, and on-demand Linux EC2 instances. Switching runner test instances to Spot pricing could reduce this further to **~$450/year**.
