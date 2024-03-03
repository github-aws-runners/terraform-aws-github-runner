# Module - GitHub App web hook

> This module is treated as internal module, breaking changes will not trigger a major release bump.

This module creates an API gateway endpoint and lambda function to handle GitHub App webhook events.

## Lambda Function

The Lambda function is written in [TypeScript](https://www.typescriptlang.org/) and requires Node 12.x and yarn. Sources are located in [./lambdas/webhook].

### Install

```bash
cd lambdas/webhook
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
