# Runner Count Cache Module

This module provides a DynamoDB-based caching system for tracking the number of active EC2 runners. It significantly reduces the need for EC2 `DescribeInstances` API calls during scale-up operations, addressing performance bottlenecks in high-volume environments.

## Problem Statement

In large-scale deployments (20K+ runners per day), the scale-up Lambda function's use of `DescribeInstances` to count current runners can:

- Cause EC2 API rate limiting (throttling)
- Add 15+ seconds of latency to scaling decisions
- Impact overall scaling performance

See [Issue #4710](https://github.com/github-aws-runners/terraform-aws-github-runner/issues/4710) for details.

## Solution Architecture

```
┌─────────────────┐                    ┌─────────────────┐
│ EC2 Instance    │  State Change      │ EventBridge     │
│ Lifecycle       │ ─────────────────► │ Rule            │
└─────────────────┘                    └────────┬────────┘
                                                │
                                                ▼
                                       ┌────────────────┐
                                       │ Counter Lambda │
                                       │ (update count) │
                                       └───────┬────────┘
                                               │
                                               ▼
┌─────────────────┐                    ┌───────────────────┐
│ Scale-Up Lambda │ ◄──── Read ─────── │ DynamoDB Table    │
│ (check limit)   │                    │ ┌───────────────┐ │
└─────────────────┘                    │ │ pk: env#type  │ │
        │                              │ │ count: 42     │ │
        │ Fallback if stale            │ │ updated: ts   │ │
        ▼                              │ └───────────────┘ │
┌─────────────────┐                    └───────────────────┘
│ EC2 Describe    │
│ Instances       │
└─────────────────┘
```

## Features

- **Event-driven**: Uses EventBridge to react to EC2 state changes in real-time
- **Atomic counters**: DynamoDB atomic increments/decrements prevent race conditions
- **Auto-cleanup**: TTL on DynamoDB items prevents stale data accumulation
- **Fallback support**: Scale-up Lambda falls back to EC2 API if cache is stale
- **Low cost**: PAY_PER_REQUEST billing, typically pennies per month

## Usage

```hcl
module "runner_count_cache" {
  source = "./modules/runner-count-cache"

  prefix             = "github-runners"
  environment_filter = "production"

  tags = {
    Environment = "production"
  }
}
```

## Integration with Scale-Up Lambda

The scale-up Lambda can be configured to use this cache by setting these environment variables:

- `RUNNER_COUNT_CACHE_TABLE_NAME`: DynamoDB table name
- `RUNNER_COUNT_CACHE_STALE_THRESHOLD_MS`: Maximum age of cached counts (default: 60000)

## Requirements

| Name | Version |
|------|---------|
| terraform | >= 1.3.0 |
| aws | ~> 5.27 |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| prefix | The prefix used for naming resources | `string` | n/a | yes |
| environment_filter | The environment tag value to filter EC2 instances | `string` | n/a | yes |
| tags | Map of tags to add to resources | `map(string)` | `{}` | no |
| kms_key_arn | Optional CMK Key ARN for DynamoDB encryption | `string` | `null` | no |
| cache_stale_threshold_ms | Max age before cache is considered stale | `number` | `60000` | no |
| ttl_seconds | TTL for DynamoDB items in seconds | `number` | `86400` | no |

## Outputs

| Name | Description |
|------|-------------|
| dynamodb_table | DynamoDB table name and ARN |
| lambda_function | Counter Lambda function name and ARN |
| eventbridge_rule | EventBridge rule name and ARN |
| cache_config | Configuration for scale-up Lambda |
