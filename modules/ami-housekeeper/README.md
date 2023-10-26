# Module - AMI Housekeeper

This module deploys a Lambda function responsible for deleting outdated AMIs. You can specify various criteria for the deletion process. Please note that the creation of AMIs is not within the scope of this project; the Lambda's role is solely to remove old ones. To avoid potential conflicts, it is recommended to deploy this module only once.

By default, the Lambda will scan all launch templates and assume that only the default version is in use. Any other AMIs referenced in the launch templates will be considered outdated and subject to deletion. Additionally, the module can search for AMIs referenced in AWS Systems Manager (SSM). When you set ssmParameterNames to *ami-id, the module will regard all AMIs referenced in SSM as in use, sparing them from deletion.

You can further refine the deletion process by applying AMI filters, such as those based on tags. The module also offers a 'dry run' option, allowing you to test the Lambda's behavior before executing actual deletions.

## Usages

The module can be activated via the main module by setting `enable_ami_housekeeper` to `true`. Or invoking the module directly.

```
module "ami_housekeeper" {
  source = "path to module"

  prefix = "my-prefix"

  ami_cleanup_config = {
    ssmParameterNames = ["*/ami-id"]
    minimumDaysOld    = 30
    filters = [
      {
        Name   = "tag:Packer"
        Values = ["true"]
      }
    ]
    dryRun = true
  }

  log_level = "debug"
}
```

## Development

## Lambda Function

The Lambda function is written in [TypeScript](https://www.typescriptlang.org/) and requires Node and yarn. Sources are located in [./lamdas].

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

<!-- END_TF_DOCS -->
