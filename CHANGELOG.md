# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Fix missing permissions for CloudWatch Agent #445 @bennettp123

## [0.8.1] - 2020-12-08
### Changed
- Policy is missing for streaming logs to cloudwatch #388

## [0.8.0] - 2020-12-08

### Changed

- Examples upgraded to Terraform 13  (#372)
### Added

- Streaming runner logs to cloudwatch #375

## [0.7.0] - 2020-12-04

### Changed

- Small clarifications in the README #368 @lrytz

### Added

- Allow operator to pass in a list of managed IAM policy ARNs for the runner role #361 @jpalomaki
- expand options for sourcing lambda to include S3 #292 @eky5006 

## [0.6.0] - 2020-10-10

### Added

- Only allow tagging and termination of runner instances #201 @jpalomaki 

### Fixed

- Fix pagination with listing self-hosted runners #202 @HenryNguyen5 


## [0.5.0] - 2020-08-25

### Added

- feat: Manage log groups via module. When upgrading you have to import the log groups by AWS into your state. See below the example commands for the default example.

```bash
terraform import module.runners.module.runner_binaries.aws_cloudwatch_log_group.syncer "/aws/lambda/default-syncer"
terraform import module.runners.module.runners.aws_cloudwatch_log_group.scale_up "/aws/lambda/default-scale-up"
terraform import module.runners.module.runners.aws_cloudwatch_log_group.scale_down "/aws/lambda/default-scale-down"
terraform import module.runners.module.webhook.aws_cloudwatch_log_group.webhook "/aws/lambda/default-webhook"
```
- feat: Expose ami-filters and user-data template file location to users to allow use of custom AMIs

- feat: Added option to binaries syncer to upgrade to pre-releases, preventing any auto-updating on startup. Option `runner_allow_prerelease_binaries` is disabled by default. (#141, #165) @sjagoe

- feat: SSM policies are by default disabled, set `enable_ssm_on_runners` to `true` to enable access to the runner instances via SSM. (#143) @HenryNguyen5

- feat: Log full sqs event (#147) @HenryNguyen5

## [0.4.0] - 2020-08-10

### Added

- feat: idle runners #113

## [0.3.0] - 2020-08-06

### Added

- feat: Add support for ARM64 runners #102 @bdruth
- feat: added variables in the root module to allow passing in pre and and post install #45 @jaydenrasmussen

### Updated

- fix: Build script not entering all the module directories (#103) @alonsohki
- fix: Remove Orphan AWS runners (#79)
- fix: documentation for downloading lambdas (#78) @@bendavies
- fix: Rename variable and fix variables descriptions (#75) @bendavies @leoblanc

## [0.2.0] - 2020-06-15

### Added

- #34 encrypt secrets via KMS (#37)

## [0.1.0] - 2020-05-25

### Added

- #30 - Add parameter to terraform to set max number of runners (#31)

### Updated

- #17 - adding tests for syncer (#33)
- #20 #21 - Improve docs, add readme, add hook generate terraform docs

## [0.0.1] - 2020-05-19

### Added

- First release.

[unreleased]: https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.8.1..HEAD
[0.8.1]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.8.0..v0.8.1
[0.8.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.7.0..v0.8.0
[0.7.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.6.0..v0.7.0
[0.6.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.5.0..v0.6.0
[0.5.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.4.0..v0.5.0
[0.4.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.3.0..v0.4.0
[0.3.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.2.0..v0.3.0
[0.2.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.1.0..v0.2.0
[0.1.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.0.1..v0.1.0
[0.0.1]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.0.1
