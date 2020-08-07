# Module - Runner binaries syncer

This module creates a lambda that will sync GitHub action binary to a S3 bucket, the lambda will be triggered via a CloudWatch event. The distribution is cached to avoid the latency of downloading the distribution during the setup. After deployment the lambda will be triggered via an S3 object created at deployment time.

## Usages

Usage examples are available in the root module. By default the root module will assume local zip files containing the lambda distribution are available. See the [download lambda module](../download-lambda/README.md) for more information.

## Lambda Function

The Lambda function is written in [TypeScript](https://www.typescriptlang.org/) and requires Node 12.x and yarn. Sources are located in [./lambdas/runners-binaries-syncer].

### Install

```bash
cd lambdas/runners
yarn install
```

### Test

Test are implemented with [Jest](https://jestjs.io/), calls to AWS and GitHub are mocked.

```bash
yarn run test
```

### Package

To compile all TypeScript/JavaScript sources in a single file [ncc](https://github.com/zeit/ncc) is used.

```bash
yarn run dist
```

<!-- BEGINNING OF PRE-COMMIT-TERRAFORM DOCS HOOK -->
## Requirements

No requirements.

## Providers

| Name | Version |
|------|---------|
| aws | n/a |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| aws\_region | AWS region. | `string` | n/a | yes |
| distribution\_bucket\_name | Bucket for storing the action runner distribution. | `string` | n/a | yes |
| environment | A name that identifies the environment, used as prefix and for tagging. | `string` | n/a | yes |
| lambda\_schedule\_expression | Scheduler expression for action runner binary syncer. | `string` | `"cron(27 * * * ? *)"` | no |
| lambda\_timeout | Time out of the lambda in seconds. | `number` | `300` | no |
| lambda\_zip | File location of the lambda zip file. | `string` | `null` | no |
| role\_path | The path that will be added to the role, if not set the environment name will be used. | `string` | `null` | no |
| role\_permissions\_boundary | Permissions boundary that will be added to the created role for the lambda. | `string` | `null` | no |
| runner\_architecture | The platform architecture for the runner instance (x64, arm64), defaults to 'x64' | `string` | `"x64"` | no |
| tags | Map of tags that will be added to created resources. By default resources will be tagged with name and environment. | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| bucket | n/a |
| lambda | n/a |
| lambda\_role | n/a |
| runner\_distribution\_object\_key | n/a |

<!-- END OF PRE-COMMIT-TERRAFORM DOCS HOOK -->

## Philips Forest

This module is part of the Philips Forest.

```

                                                     ___                   _
                                                    / __\__  _ __ ___  ___| |_
                                                   / _\/ _ \| '__/ _ \/ __| __|
                                                  / / | (_) | | |  __/\__ \ |_
                                                  \/   \___/|_|  \___||___/\__|

                                                                 Infrastructure

```

Talk to the forestkeepers in the `forest`-channel on Slack.

[![Slack](https://philips-software-slackin.now.sh/badge.svg)](https://philips-software-slackin.now.sh)
