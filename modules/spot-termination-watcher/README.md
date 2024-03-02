# Module - Spot Termination Watcher


## Usages

The module can be activated via the main module by setting `________` to `true`. Or invoking the module directly.

```
module "spot_termination_watcher" {
  source = "path to module"


}
```

## Development

## Lambda Function

The Lambda function is written in [TypeScript](https://www.typescriptlang.org/) and requires Node and yarn. Sources are located in [https://github.com/philips-labs/terraform-aws-github-runner/tree/main/lambdas].

### Install

```bash
cd lambdas
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

