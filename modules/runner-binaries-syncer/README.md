# Module - Runner binaries syncer

> This module is treated as internal module, breaking changes will not trigger a major release bump.

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

<!-- BEGIN_TF_DOCS -->

<!-- END_TF_DOCS -->
