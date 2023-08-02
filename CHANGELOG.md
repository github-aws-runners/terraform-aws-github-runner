# Changelog

## [4.0.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v4.0.0...v4.0.1) (2023-07-31)


### Bug Fixes

* allow disable JIT config for ephemeral runners ([#3393](https://github.com/philips-labs/terraform-aws-github-runner/issues/3393)) ([cfbcc94](https://github.com/philips-labs/terraform-aws-github-runner/commit/cfbcc944fc183b481caaee323e7832ec1964eb54))

## [4.0.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.6.1...v4.0.0) (2023-07-25)


### ⚠ BREAKING CHANGES

* replace registration tokens by JIT config for ephemeral runners ([#3350](https://github.com/philips-labs/terraform-aws-github-runner/issues/3350))

### Features

* replace registration tokens by JIT config for ephemeral runners ([#3350](https://github.com/philips-labs/terraform-aws-github-runner/issues/3350)) ([2b776ba](https://github.com/philips-labs/terraform-aws-github-runner/commit/2b776bacb306be2eb14cf20f31251eb544a3cfba))


### Bug Fixes

* **lambda:** bump the aws group in /lambdas with 3 updates ([#3381](https://github.com/philips-labs/terraform-aws-github-runner/issues/3381)) ([3af675a](https://github.com/philips-labs/terraform-aws-github-runner/commit/3af675a05ece3dd55f9680249fb8c6e3bcd51811))
* **lambda:** bump the octokit group in /lambdas with 4 updates ([#3386](https://github.com/philips-labs/terraform-aws-github-runner/issues/3386)) ([b067138](https://github.com/philips-labs/terraform-aws-github-runner/commit/b067138bccd68ae3ee56c9b8168a6737c6cbb46b))
* scale up lambda build issue. ([#3388](https://github.com/philips-labs/terraform-aws-github-runner/issues/3388)) ([e78232c](https://github.com/philips-labs/terraform-aws-github-runner/commit/e78232caeeeab8829c04a9785ee05ddfe07939c1))

## [3.6.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.6.0...v3.6.1) (2023-07-20)


### Bug Fixes

* add state for multi-runner default ami-filter ([#3373](https://github.com/philips-labs/terraform-aws-github-runner/issues/3373)) ([f5b6ead](https://github.com/philips-labs/terraform-aws-github-runner/commit/f5b6eade82163373fff8ee9f4dc07242a44a3b92))
* broken AMI fileter ([#3371](https://github.com/philips-labs/terraform-aws-github-runner/issues/3371)) ([999d139](https://github.com/philips-labs/terraform-aws-github-runner/commit/999d139c49bbce4de681d95d4462adbccec5f4fa))
* **lambda:** bump word-wrap from 1.2.3 to 1.2.4 in /lambdas ([#3374](https://github.com/philips-labs/terraform-aws-github-runner/issues/3374)) ([c320253](https://github.com/philips-labs/terraform-aws-github-runner/commit/c320253d8cd86a5190ef67e748e7d296e03ef788))
* merge ami filters. ([999d139](https://github.com/philips-labs/terraform-aws-github-runner/commit/999d139c49bbce4de681d95d4462adbccec5f4fa))
* retry aws metadata token download ([#3292](https://github.com/philips-labs/terraform-aws-github-runner/issues/3292)) ([5537474](https://github.com/philips-labs/terraform-aws-github-runner/commit/553747418daaf92b6732615cdfc8df91a6295366))

## [3.6.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.5.0...v3.6.0) (2023-07-18)


### Features

* **images:** Allow specifying temporary security group source IP for packer builds ([#3351](https://github.com/philips-labs/terraform-aws-github-runner/issues/3351)) ([6d018f6](https://github.com/philips-labs/terraform-aws-github-runner/commit/6d018f648d998342c3e01443d49b60315d6c8f7f))
* **syncer:** update bucket policy to require ssl ([#3342](https://github.com/philips-labs/terraform-aws-github-runner/issues/3342)) ([7a3d825](https://github.com/philips-labs/terraform-aws-github-runner/commit/7a3d8256c8a28849f84516d49a44e537e77eb4f2))
* tag runner volumes with the same tags as the instance ([#3354](https://github.com/philips-labs/terraform-aws-github-runner/issues/3354)) ([116ea58](https://github.com/philips-labs/terraform-aws-github-runner/commit/116ea580eb004d581f46e4f245a3d3409c3b7568))
* update bucket policy to require ssl ([7a3d825](https://github.com/philips-labs/terraform-aws-github-runner/commit/7a3d8256c8a28849f84516d49a44e537e77eb4f2))


### Bug Fixes

* add more outputs to multi runners module. ([#3343](https://github.com/philips-labs/terraform-aws-github-runner/issues/3343)) ([41a74ec](https://github.com/philips-labs/terraform-aws-github-runner/commit/41a74ec6203e8a5f6af96fa7c054724108b08874))
* Changed the ami filters to ensure that AMI is available before its used in launch template. ([#3220](https://github.com/philips-labs/terraform-aws-github-runner/issues/3220)) ([0bcfbc7](https://github.com/philips-labs/terraform-aws-github-runner/commit/0bcfbc784fd22313a36613fe1209fede8a52e254))
* **lambda:** bump @aws-lambda-powertools/logger from 1.8.0 to 1.10.0 in /lambdas ([#3337](https://github.com/philips-labs/terraform-aws-github-runner/issues/3337)) ([708748a](https://github.com/philips-labs/terraform-aws-github-runner/commit/708748aa6e29681682ebec0efdcb28ff84c362c2))
* **lambda:** bump semver from 5.7.1 to 5.7.2 in /lambdas ([#3359](https://github.com/philips-labs/terraform-aws-github-runner/issues/3359)) ([1279e8c](https://github.com/philips-labs/terraform-aws-github-runner/commit/1279e8cfaefe595ffefa803bd1e61cccf8075586))
* **lambda:** bump the aws group in /lambdas with 5 updates ([#3368](https://github.com/philips-labs/terraform-aws-github-runner/issues/3368)) ([32c15ec](https://github.com/philips-labs/terraform-aws-github-runner/commit/32c15ec3cc38365224871b6806cc21f015f8f0a7))
* **lambda:** Rename scale-down.tf service name ([#3361](https://github.com/philips-labs/terraform-aws-github-runner/issues/3361)) ([22fad41](https://github.com/philips-labs/terraform-aws-github-runner/commit/22fad412b7b91706cc3cb7b227a9d57c1d77d73a))
* **multi-runner:** Fix runner_additional_security_group_ids ([#3352](https://github.com/philips-labs/terraform-aws-github-runner/issues/3352)) ([1f0c938](https://github.com/philips-labs/terraform-aws-github-runner/commit/1f0c938e71e3afc81921c5659cc9e6267dafdf46))

## [3.5.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.4.2...v3.5.0) (2023-06-21)


### Features

* Support AWS 5.x Terraform provider ([#3315](https://github.com/philips-labs/terraform-aws-github-runner/issues/3315)) ([d0e8960](https://github.com/philips-labs/terraform-aws-github-runner/commit/d0e89608f52ff0db4abe204af6718a73e780ea98))


### Bug Fixes

* **lambda:** bump @aws-sdk/client-ec2 from 3.352.0 to 3.356.0 in /lambdas ([#3333](https://github.com/philips-labs/terraform-aws-github-runner/issues/3333)) ([9cb0369](https://github.com/philips-labs/terraform-aws-github-runner/commit/9cb0369195855ea2e1f75f905098588101a166f8))
* **lambda:** bump @aws-sdk/client-s3 from 3.352.0 to 3.354.0 in /lambdas ([#3329](https://github.com/philips-labs/terraform-aws-github-runner/issues/3329)) ([37acc92](https://github.com/philips-labs/terraform-aws-github-runner/commit/37acc9247526fdfbe940fca1ad19beea89f3576c))
* **lambda:** bump @aws-sdk/client-ssm from 3.321.1 to 3.350.0 in /lambdas ([#3319](https://github.com/philips-labs/terraform-aws-github-runner/issues/3319)) ([97d5c73](https://github.com/philips-labs/terraform-aws-github-runner/commit/97d5c7384cbeec38ee0d9b16167ed4a2f883d291))
* **lambda:** bump @aws-sdk/client-ssm from 3.352.0 to 3.354.0 in /lambdas ([#3327](https://github.com/philips-labs/terraform-aws-github-runner/issues/3327)) ([e315230](https://github.com/philips-labs/terraform-aws-github-runner/commit/e315230f42d9b321a3ba28ff7f9294fc77dec78d))

## [3.4.2](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.4.1...v3.4.2) (2023-06-13)


### Bug Fixes

* Fix pool logic with runner name prefix ([#3303](https://github.com/philips-labs/terraform-aws-github-runner/issues/3303)) ([66e2a66](https://github.com/philips-labs/terraform-aws-github-runner/commit/66e2a66adcf200a85c0200382756f4fa5a71aadb))
* remove duplicate vpc execution permissions ([#3304](https://github.com/philips-labs/terraform-aws-github-runner/issues/3304)) ([0bebeef](https://github.com/philips-labs/terraform-aws-github-runner/commit/0bebeef094b2e64af7f81166becae6c65167df86))

## [3.4.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.4.0...v3.4.1) (2023-05-23)


### Bug Fixes

* added additional outputs to multi runner module. ([#3283](https://github.com/philips-labs/terraform-aws-github-runner/issues/3283)) ([9644e05](https://github.com/philips-labs/terraform-aws-github-runner/commit/9644e05a2345369349ee9217da47db68860997d5))
* **lambda:** bump @aws-sdk/client-sqs from 3.321.1 to 3.332.0 in /lambdas ([#3271](https://github.com/philips-labs/terraform-aws-github-runner/issues/3271)) ([170baa8](https://github.com/philips-labs/terraform-aws-github-runner/commit/170baa8e8799a6335f4d0f868e89a8496632aa11))
* **lambda:** bump @aws-sdk/client-sqs from 3.332.0 to 3.337.0 in /lambdas ([#3284](https://github.com/philips-labs/terraform-aws-github-runner/issues/3284)) ([01a053e](https://github.com/philips-labs/terraform-aws-github-runner/commit/01a053ee049c7a7cd80241d10272155c1a94af88))
* **lambda:** bump @aws-sdk/lib-storage from 3.321.1 to 3.335.0 in /lambdas ([#3281](https://github.com/philips-labs/terraform-aws-github-runner/issues/3281)) ([9387bee](https://github.com/philips-labs/terraform-aws-github-runner/commit/9387bee757d7692b33a5599a6d2868de9f2ba492))
* **lambda:** bump @aws-sdk/lib-storage from 3.335.0 to 3.337.0 in /lambdas ([#3286](https://github.com/philips-labs/terraform-aws-github-runner/issues/3286)) ([2a447ae](https://github.com/philips-labs/terraform-aws-github-runner/commit/2a447ae43520e9fca19d103ae956d5eb44e7f21a))
* **lambda:** bump @octokit/auth-app from 4.0.9 to 4.0.13 in /lambdas ([#3287](https://github.com/philips-labs/terraform-aws-github-runner/issues/3287)) ([517d2e0](https://github.com/philips-labs/terraform-aws-github-runner/commit/517d2e02623ec863ebeb1fae105332026a32fe9e))
* **lambda:** bump @octokit/types from 9.2.1 to 9.2.2 in /lambdas ([#3273](https://github.com/philips-labs/terraform-aws-github-runner/issues/3273)) ([e083898](https://github.com/philips-labs/terraform-aws-github-runner/commit/e083898e4da41c0c1f180094ae132479bc155ee6))
* **multi-runner:** allow runner_additional_security_group_ids to apply to multi_runner_config ([#3221](https://github.com/philips-labs/terraform-aws-github-runner/issues/3221)) ([5fb1fa8](https://github.com/philips-labs/terraform-aws-github-runner/commit/5fb1fa87e2cec416051c225e5b32504df1e30004))
* **multi-runner:** enable SSE by default for runner-binaries bucket ([#3274](https://github.com/philips-labs/terraform-aws-github-runner/issues/3274)) ([5d314f2](https://github.com/philips-labs/terraform-aws-github-runner/commit/5d314f2966381f6d281ef913f601f579e627f260))
* **webhook:** logic to find the workflow labels inside runner config supported labelsets. ([#3278](https://github.com/philips-labs/terraform-aws-github-runner/issues/3278)) ([9fcf33a](https://github.com/philips-labs/terraform-aws-github-runner/commit/9fcf33a86254cf64f115327f506c940583144ed5))

## [3.4.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.3.0...v3.4.0) (2023-05-12)


### Features

* **runners:** allow explicitly standard or unlimited ([#3244](https://github.com/philips-labs/terraform-aws-github-runner/issues/3244)) ([e2cf7ac](https://github.com/philips-labs/terraform-aws-github-runner/commit/e2cf7ace992df354281c19f8240a97c134264758))


### Bug Fixes

* Expand repository_white_list documentation ([#3254](https://github.com/philips-labs/terraform-aws-github-runner/issues/3254)) ([5f3771a](https://github.com/philips-labs/terraform-aws-github-runner/commit/5f3771af9e81f362f598fed5178e6f029fa2aa23))
* **lambda:** bump @octokit/types from 9.2.0 to 9.2.1 in /lambdas ([#3259](https://github.com/philips-labs/terraform-aws-github-runner/issues/3259)) ([4bb77e0](https://github.com/philips-labs/terraform-aws-github-runner/commit/4bb77e062d378d52adddeb97929166d1ba9a95c4))

## [3.3.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.2.0...v3.3.0) (2023-05-05)


### Features

* added the option to generate outputs from packer builds. ([#3246](https://github.com/philips-labs/terraform-aws-github-runner/issues/3246)) ([97c4ee7](https://github.com/philips-labs/terraform-aws-github-runner/commit/97c4ee7d1145c5f10ea01bbe4a81e1e6e827cef9))
* **syncer:** Enable S3 bucket versioning for syncer S3 bucket ([#3108](https://github.com/philips-labs/terraform-aws-github-runner/issues/3108)) ([e679021](https://github.com/philips-labs/terraform-aws-github-runner/commit/e67902133b2ab426068964c9bc24aab6ecd37a79))


### Bug Fixes

* **lambda:** bump @octokit/types from 9.1.2 to 9.2.0 in /lambdas ([#3243](https://github.com/philips-labs/terraform-aws-github-runner/issues/3243)) ([4ff85bb](https://github.com/philips-labs/terraform-aws-github-runner/commit/4ff85bbdb7fc00b8174092ed23c2eef10842460b))
* **lambda:** bump axios from 1.3.6 to 1.4.0 in /lambdas ([#3242](https://github.com/philips-labs/terraform-aws-github-runner/issues/3242)) ([5620d88](https://github.com/philips-labs/terraform-aws-github-runner/commit/5620d886d74423889eb13f3c1746f784fbcb36a0))
* S3 bucket logging prefix regex ([a952b91](https://github.com/philips-labs/terraform-aws-github-runner/commit/a952b91895b6629827a5af0f54fbc5c52661e36b))
* **syncer:** S3 bucket logging prefix variable condition ([#3251](https://github.com/philips-labs/terraform-aws-github-runner/issues/3251)) ([a952b91](https://github.com/philips-labs/terraform-aws-github-runner/commit/a952b91895b6629827a5af0f54fbc5c52661e36b))

## [3.2.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.2.0...v3.2.0) (2023-04-28)


### Features

* **runner:** include instance type & availability zone in Github Action logs ([#3223](https://github.com/philips-labs/terraform-aws-github-runner/issues/3223)) ([775a548](https://github.com/philips-labs/terraform-aws-github-runner/commit/775a54831d31710d7c8faf38320e010807b1c828))
* **runners:** Include instance type & availability zone in logs ([775a548](https://github.com/philips-labs/terraform-aws-github-runner/commit/775a54831d31710d7c8faf38320e010807b1c828))


### Bug Fixes

* **lambda:** bump @aws-sdk/client-ec2 from 3.319.0 to 3.322.0 in /lambdas ([#3228](https://github.com/philips-labs/terraform-aws-github-runner/issues/3228)) ([5e66d58](https://github.com/philips-labs/terraform-aws-github-runner/commit/5e66d581a04af62c247970c665c3a4c5972f0791))
* **lambda:** bump @aws-sdk/client-s3 from 3.319.0 to 3.321.1 in /lambdas ([#3230](https://github.com/philips-labs/terraform-aws-github-runner/issues/3230)) ([42a2085](https://github.com/philips-labs/terraform-aws-github-runner/commit/42a2085af5c2b450f1f3a5383e3f55d032f11ea4))
* **lambda:** bump @aws-sdk/client-sqs from 3.319.0 to 3.321.1 in /lambdas ([#3229](https://github.com/philips-labs/terraform-aws-github-runner/issues/3229)) ([9caa02d](https://github.com/philips-labs/terraform-aws-github-runner/commit/9caa02d997fa0a620a71a96d54f06bd3f4cc2d2e))
* **lambda:** bump @aws-sdk/lib-storage from 3.319.0 to 3.321.1 in /lambdas ([#3227](https://github.com/philips-labs/terraform-aws-github-runner/issues/3227)) ([37e970a](https://github.com/philips-labs/terraform-aws-github-runner/commit/37e970a38dca95c974901163d7ae26312b446aba))
* **multi-runner:** convertdistribution_bucket_name to lowercase ([#3219](https://github.com/philips-labs/terraform-aws-github-runner/issues/3219)) ([43acb08](https://github.com/philips-labs/terraform-aws-github-runner/commit/43acb08d94841ad5cdb3c3f08d078e67edcd84ea))
* remove deprecated use of S3 ACLs ([#3222](https://github.com/philips-labs/terraform-aws-github-runner/issues/3222)) ([bf4cea8](https://github.com/philips-labs/terraform-aws-github-runner/commit/bf4cea84e9c3409dfc8b6c966c083d53444098ad))

## [3.2.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.2.0...v3.2.0) (2023-04-28)


### Features

* **runner:** include instance type & availability zone in Github Action logs ([#3223](https://github.com/philips-labs/terraform-aws-github-runner/issues/3223)) ([775a548](https://github.com/philips-labs/terraform-aws-github-runner/commit/775a54831d31710d7c8faf38320e010807b1c828))
* **runners:** Include instance type & availability zone in logs ([775a548](https://github.com/philips-labs/terraform-aws-github-runner/commit/775a54831d31710d7c8faf38320e010807b1c828))


### Bug Fixes

* **lambda:** bump @aws-sdk/client-ec2 from 3.319.0 to 3.322.0 in /lambdas ([#3228](https://github.com/philips-labs/terraform-aws-github-runner/issues/3228)) ([5e66d58](https://github.com/philips-labs/terraform-aws-github-runner/commit/5e66d581a04af62c247970c665c3a4c5972f0791))
* **lambda:** bump @aws-sdk/client-s3 from 3.319.0 to 3.321.1 in /lambdas ([#3230](https://github.com/philips-labs/terraform-aws-github-runner/issues/3230)) ([42a2085](https://github.com/philips-labs/terraform-aws-github-runner/commit/42a2085af5c2b450f1f3a5383e3f55d032f11ea4))
* **lambda:** bump @aws-sdk/client-sqs from 3.319.0 to 3.321.1 in /lambdas ([#3229](https://github.com/philips-labs/terraform-aws-github-runner/issues/3229)) ([9caa02d](https://github.com/philips-labs/terraform-aws-github-runner/commit/9caa02d997fa0a620a71a96d54f06bd3f4cc2d2e))
* **lambda:** bump @aws-sdk/lib-storage from 3.319.0 to 3.321.1 in /lambdas ([#3227](https://github.com/philips-labs/terraform-aws-github-runner/issues/3227)) ([37e970a](https://github.com/philips-labs/terraform-aws-github-runner/commit/37e970a38dca95c974901163d7ae26312b446aba))
* **multi-runner:** convertdistribution_bucket_name to lowercase ([#3219](https://github.com/philips-labs/terraform-aws-github-runner/issues/3219)) ([43acb08](https://github.com/philips-labs/terraform-aws-github-runner/commit/43acb08d94841ad5cdb3c3f08d078e67edcd84ea))
* remove deprecated use of S3 ACLs ([#3222](https://github.com/philips-labs/terraform-aws-github-runner/issues/3222)) ([bf4cea8](https://github.com/philips-labs/terraform-aws-github-runner/commit/bf4cea84e9c3409dfc8b6c966c083d53444098ad))

## [3.2.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.1.0...v3.2.0) (2023-04-28)


### Features

* **runner:** include instance type & availability zone in Github Action logs ([#3223](https://github.com/philips-labs/terraform-aws-github-runner/issues/3223)) ([775a548](https://github.com/philips-labs/terraform-aws-github-runner/commit/775a54831d31710d7c8faf38320e010807b1c828))
* **runners:** Include instance type & availability zone in logs ([775a548](https://github.com/philips-labs/terraform-aws-github-runner/commit/775a54831d31710d7c8faf38320e010807b1c828))


### Bug Fixes

* **lambda:** bump @aws-sdk/client-ec2 from 3.319.0 to 3.322.0 in /lambdas ([#3228](https://github.com/philips-labs/terraform-aws-github-runner/issues/3228)) ([5e66d58](https://github.com/philips-labs/terraform-aws-github-runner/commit/5e66d581a04af62c247970c665c3a4c5972f0791))
* **lambda:** bump @aws-sdk/client-s3 from 3.319.0 to 3.321.1 in /lambdas ([#3230](https://github.com/philips-labs/terraform-aws-github-runner/issues/3230)) ([42a2085](https://github.com/philips-labs/terraform-aws-github-runner/commit/42a2085af5c2b450f1f3a5383e3f55d032f11ea4))
* **lambda:** bump @aws-sdk/client-sqs from 3.319.0 to 3.321.1 in /lambdas ([#3229](https://github.com/philips-labs/terraform-aws-github-runner/issues/3229)) ([9caa02d](https://github.com/philips-labs/terraform-aws-github-runner/commit/9caa02d997fa0a620a71a96d54f06bd3f4cc2d2e))
* **lambda:** bump @aws-sdk/lib-storage from 3.319.0 to 3.321.1 in /lambdas ([#3227](https://github.com/philips-labs/terraform-aws-github-runner/issues/3227)) ([37e970a](https://github.com/philips-labs/terraform-aws-github-runner/commit/37e970a38dca95c974901163d7ae26312b446aba))
* **multi-runner:** convertdistribution_bucket_name to lowercase ([#3219](https://github.com/philips-labs/terraform-aws-github-runner/issues/3219)) ([43acb08](https://github.com/philips-labs/terraform-aws-github-runner/commit/43acb08d94841ad5cdb3c3f08d078e67edcd84ea))
* remove deprecated use of S3 ACLs ([#3222](https://github.com/philips-labs/terraform-aws-github-runner/issues/3222)) ([bf4cea8](https://github.com/philips-labs/terraform-aws-github-runner/commit/bf4cea84e9c3409dfc8b6c966c083d53444098ad))

## [3.1.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.0.3...v3.1.0) (2023-04-20)


### Features

* **images:** automatically find latest GitHub Runner version when building images ([#3129](https://github.com/philips-labs/terraform-aws-github-runner/issues/3129)) ([da49078](https://github.com/philips-labs/terraform-aws-github-runner/commit/da49078d786cf1b5e6c7f1d053ce9bbcea7de658))
* **lambda:** add support for X-Ray tracing ([#3142](https://github.com/philips-labs/terraform-aws-github-runner/issues/3142)) ([998a0d1](https://github.com/philips-labs/terraform-aws-github-runner/commit/998a0d1381e45a52fb909396c2317ca72edec814))

## [3.0.3](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.0.2...v3.0.3) (2023-04-18)


### Bug Fixes

* **runners:** bump @aws-lambda-powertools/logger from 1.6.0 to 1.8.0 in /modules/runners/lambdas/runners ([#3166](https://github.com/philips-labs/terraform-aws-github-runner/issues/3166)) ([2015dcf](https://github.com/philips-labs/terraform-aws-github-runner/commit/2015dcf9b45ea7d3079daa9dc1345a03de5dee43))
* **syncer:** bump @aws-sdk/client-s3 from 3.296.0 to 3.315.0 in /modules/runner-binaries-syncer/lambdas/runner-binaries-syncer ([#3190](https://github.com/philips-labs/terraform-aws-github-runner/issues/3190)) ([31c9987](https://github.com/philips-labs/terraform-aws-github-runner/commit/31c9987da90a1b467bb1cee9451d2bb5f9fd5241))
* **syncer:** bump @aws-sdk/lib-storage from 3.305.0 to 3.315.0 in /modules/runner-binaries-syncer/lambdas/runner-binaries-syncer ([#3187](https://github.com/philips-labs/terraform-aws-github-runner/issues/3187)) ([88e5d5d](https://github.com/philips-labs/terraform-aws-github-runner/commit/88e5d5d364057a7527a54edf20ed15bcacbe3830))
* **syncer:** bump axios from 1.3.4 to 1.3.5 in /modules/runner-binaries-syncer/lambdas/runner-binaries-syncer ([#3171](https://github.com/philips-labs/terraform-aws-github-runner/issues/3171)) ([b8ff326](https://github.com/philips-labs/terraform-aws-github-runner/commit/b8ff3266e03c257cdc564a296d627b60367c212b))
* **syncer:** lowercase distribution_bucket_name ([#3194](https://github.com/philips-labs/terraform-aws-github-runner/issues/3194)) ([b75010e](https://github.com/philips-labs/terraform-aws-github-runner/commit/b75010ea8e10bb1071bbeec353ef9a384695a3bc))
* **webhook:** bump @aws-sdk/client-sqs from 3.303.0 to 3.315.0 in /modules/webhook/lambdas/webhook ([#3192](https://github.com/philips-labs/terraform-aws-github-runner/issues/3192)) ([882f911](https://github.com/philips-labs/terraform-aws-github-runner/commit/882f911c0b3dca97e8409599e8bd2fcc7fd8bac5))
* **webhook:** bump @aws-sdk/client-ssm from 3.306.0 to 3.315.0 in /modules/webhook/lambdas/webhook ([#3191](https://github.com/philips-labs/terraform-aws-github-runner/issues/3191)) ([8cea8af](https://github.com/philips-labs/terraform-aws-github-runner/commit/8cea8afc5316152f5b0ecdb3e94c1bc66ea37b3b))

## [3.0.2](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.0.1...v3.0.2) (2023-04-07)


### Bug Fixes

* **runners:** bump cron-parser from 4.7.1 to 4.8.1 in /modules/runners/lambdas/runners ([#3154](https://github.com/philips-labs/terraform-aws-github-runner/issues/3154)) ([698b1ba](https://github.com/philips-labs/terraform-aws-github-runner/commit/698b1ba3cb675bc21fe91899474fde38576aa6e8))
* **runners:** bump typescript from 4.9.4 to 4.9.5 in /modules/runners/lambdas/runners ([#3148](https://github.com/philips-labs/terraform-aws-github-runner/issues/3148)) ([9cfa54d](https://github.com/philips-labs/terraform-aws-github-runner/commit/9cfa54dfdaa5c8cf6d312e2b4a6ce28316d91a99))
* **runners:** upgrade aws sdk v2 to v3 ([#3138](https://github.com/philips-labs/terraform-aws-github-runner/issues/3138)) ([48da039](https://github.com/philips-labs/terraform-aws-github-runner/commit/48da03923a74f9ff5acff44bca39d4e19bae31b3))
* **syncer:** bump @aws-sdk/lib-storage from 3.300.0 to 3.305.0 in /modules/runner-binaries-syncer/lambdas/runner-binaries-syncer ([#3153](https://github.com/philips-labs/terraform-aws-github-runner/issues/3153)) ([ec51969](https://github.com/philips-labs/terraform-aws-github-runner/commit/ec5196986448e8ac6bfc249f82f9d32a93d40df5))
* **webhook:** bump @aws-sdk/client-ssm from 3.294.0 to 3.306.0 in /modules/webhook/lambdas/webhook ([#3164](https://github.com/philips-labs/terraform-aws-github-runner/issues/3164)) ([e6b6eef](https://github.com/philips-labs/terraform-aws-github-runner/commit/e6b6eef28eb7d444e795537cd3a60e5e701e08f2))

## [3.0.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v3.0.0...v3.0.1) (2023-03-31)


### Bug Fixes

* add required permission to SQS message producer ([3f1fada](https://github.com/philips-labs/terraform-aws-github-runner/commit/3f1fada5bed09993b51fae9f4b094870384d0b7f))
* Changed windows base image. ([e3708c3](https://github.com/philips-labs/terraform-aws-github-runner/commit/e3708c3cb74918306b463dd0da94dffb1cb75be8))
* **images:** Changed windows base image to Windows_Server-2022-English-Full-ECS_Optimize* ([#3128](https://github.com/philips-labs/terraform-aws-github-runner/issues/3128)) ([e3708c3](https://github.com/philips-labs/terraform-aws-github-runner/commit/e3708c3cb74918306b463dd0da94dffb1cb75be8))
* **images:** wait for cloud-init to be done before updating packages ([#3132](https://github.com/philips-labs/terraform-aws-github-runner/issues/3132)) ([92dff26](https://github.com/philips-labs/terraform-aws-github-runner/commit/92dff260d45ba54fcb98e4b722af0de770aae8f6))
* **syncer:** bump @aws-lambda-powertools/logger from 1.6.0 to 1.7.0 in /modules/runner-binaries-syncer/lambdas/runner-binaries-syncer ([#3111](https://github.com/philips-labs/terraform-aws-github-runner/issues/3111)) ([3ecb894](https://github.com/philips-labs/terraform-aws-github-runner/commit/3ecb89405a0774d51ea143e6f59aac1db75fd0da))
* **syncer:** bump @aws-sdk/lib-storage ([b2a88d4](https://github.com/philips-labs/terraform-aws-github-runner/commit/b2a88d44680f8e05dc7bb3756f73d97975cbe753))
* **webhook:** bump @aws-lambda-powertools/logger ([1a7b6de](https://github.com/philips-labs/terraform-aws-github-runner/commit/1a7b6de3497a6391dffe783021d0849b761ff419))
* **webhook:** bump @aws-sdk/client-sqs from 3.296.0 to 3.303.0 in /modules/webhook/lambdas/webhook ([#3137](https://github.com/philips-labs/terraform-aws-github-runner/issues/3137)) ([9cdf359](https://github.com/philips-labs/terraform-aws-github-runner/commit/9cdf3598346341459501b798d9ce293855b7072d))

## [3.0.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v2.6.1...v3.0.0) (2023-03-22)


### ⚠ BREAKING CHANGES

* replace tslog by awspowertools logging ([#3037](https://github.com/philips-labs/terraform-aws-github-runner/issues/3037))

### Features

* replace tslog by awspowertools logging ([#3037](https://github.com/philips-labs/terraform-aws-github-runner/issues/3037)) ([4c3ee20](https://github.com/philips-labs/terraform-aws-github-runner/commit/4c3ee20862ed75c8af05d7dad83d8336c1ebfcf5))


### Bug Fixes

* **runners:** bump @aws-sdk/client-ssm from 3.281.0 to 3.296.0 in /modules/runners/lambdas/runners ([#3098](https://github.com/philips-labs/terraform-aws-github-runner/issues/3098)) ([4a31f7b](https://github.com/philips-labs/terraform-aws-github-runner/commit/4a31f7b81c965eac4c640545c9d7df96e1ecd829))
* **runners:** bump @octokit/rest from 19.0.5 to 19.0.7 in /modules/runners/lambdas/runners ([#3078](https://github.com/philips-labs/terraform-aws-github-runner/issues/3078)) ([4b26cfd](https://github.com/philips-labs/terraform-aws-github-runner/commit/4b26cfd33f16ac44b3542a4acceedad00d672592))
* **runners:** bump aws-sdk from 2.1337.0 to 2.1340.0 in /modules/runners/lambdas/runners ([#3100](https://github.com/philips-labs/terraform-aws-github-runner/issues/3100)) ([f8cac68](https://github.com/philips-labs/terraform-aws-github-runner/commit/f8cac68ba2d9fbfcaa1042f24f9f27993bf99d3c))
* **syncer:** replaced aws-sdk v2 by aws-sdk v3 ([#3075](https://github.com/philips-labs/terraform-aws-github-runner/issues/3075)) ([ac158f6](https://github.com/philips-labs/terraform-aws-github-runner/commit/ac158f68b5cc8b024d664fee369ea18455825388))
* **webhook:** bump @aws-sdk/client-sqs from 3.294.0 to 3.296.0 in /modules/webhook/lambdas/webhook ([#3099](https://github.com/philips-labs/terraform-aws-github-runner/issues/3099)) ([87dbdf5](https://github.com/philips-labs/terraform-aws-github-runner/commit/87dbdf5d097210bca1badcc3dbf4c8b388ad4b6d))

## [2.6.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v2.6.0...v2.6.1) (2023-03-17)


### Bug Fixes

* add missing IAM permissions for runners from encrypted AMI ([#3049](https://github.com/philips-labs/terraform-aws-github-runner/issues/3049)) ([e0819f6](https://github.com/philips-labs/terraform-aws-github-runner/commit/e0819f616c3208835afc20187b8c28478cd0c5ff))
* allow the instances to send metrics ([#3067](https://github.com/philips-labs/terraform-aws-github-runner/issues/3067)) ([55c40ff](https://github.com/philips-labs/terraform-aws-github-runner/commit/55c40ff9235451b070bdde03130af1fc0ce70590))
* packer defintions missing required metadatatag for start script ([9c1fa8a](https://github.com/philips-labs/terraform-aws-github-runner/commit/9c1fa8aaffc2de319eab5fbc8290ed3b1220d580))
* **runners:** bump aws-sdk from 2.1329.0 to 2.1337.0 in /modules/runners/lambdas/runners ([#3072](https://github.com/philips-labs/terraform-aws-github-runner/issues/3072)) ([0e80518](https://github.com/philips-labs/terraform-aws-github-runner/commit/0e8051816e4a3dff568a4a9ff14f6fe0a909a48f))
* **runners:** increase the log level to WARN when using the enable_job_queued_check parameter ([#3046](https://github.com/philips-labs/terraform-aws-github-runner/issues/3046)) ([1de73bf](https://github.com/philips-labs/terraform-aws-github-runner/commit/1de73bf14c9c3898e079f3ef909d60838a7587d5))
* **syncer:** bump axios from 1.3.3 to 1.3.4 in /modules/runner-binaries-syncer/lambdas/runner-binaries-syncer ([#3059](https://github.com/philips-labs/terraform-aws-github-runner/issues/3059)) ([fa06b30](https://github.com/philips-labs/terraform-aws-github-runner/commit/fa06b30dac859595a4b08226221e388490b6e250))
* **webhook:** bump @aws-sdk/client-sqs from 3.279.0 to 3.293.0 in /modules/webhook/lambdas/webhook ([#3074](https://github.com/philips-labs/terraform-aws-github-runner/issues/3074)) ([5de5464](https://github.com/philips-labs/terraform-aws-github-runner/commit/5de5464a0e4aa77752f7c9e8e35e1e85d3c20943))
* **webhook:** bump @aws-sdk/client-ssm from 3.282.0 to 3.290.0 in /modules/webhook/lambdas/webhook ([#3058](https://github.com/philips-labs/terraform-aws-github-runner/issues/3058)) ([f626c6d](https://github.com/philips-labs/terraform-aws-github-runner/commit/f626c6de9c11105ed3a7502a68e048f041072859))

## [2.6.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v2.5.0...v2.6.0) (2023-03-13)


### Features

* **runners:** add option to prefix registered runners in GitHub ([#3043](https://github.com/philips-labs/terraform-aws-github-runner/issues/3043)) ([ea4e042](https://github.com/philips-labs/terraform-aws-github-runner/commit/ea4e0426cb32712cfd8235a799d19f65ca531387))


### Bug Fixes

* **syncer:** enable SSE by default for dist bucket ([#3048](https://github.com/philips-labs/terraform-aws-github-runner/issues/3048)) ([a7ad31a](https://github.com/philips-labs/terraform-aws-github-runner/commit/a7ad31af7e36c0f0158b7d44048ced697dd42734))

## [2.5.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v2.4.0...v2.5.0) (2023-03-10)


### Features

* added outputs for runner log groups. ([#3044](https://github.com/philips-labs/terraform-aws-github-runner/issues/3044)) ([2f683da](https://github.com/philips-labs/terraform-aws-github-runner/commit/2f683dad0053ffc0d50f8bb860fb22e487e5c00e))
* **runner:** allow linux starter-runner script to retrieve labels without with IMDSv2 tags option ([#2764](https://github.com/philips-labs/terraform-aws-github-runner/issues/2764)) ([0d8a74c](https://github.com/philips-labs/terraform-aws-github-runner/commit/0d8a74cb2d6eff7e91b6a1e41a58d1e08f86965f))


### Bug Fixes

* **pool:** ensure pool top up respects var.ami_id_ssm_parameter_name ([#3040](https://github.com/philips-labs/terraform-aws-github-runner/issues/3040)) ([c4ab242](https://github.com/philips-labs/terraform-aws-github-runner/commit/c4ab2428c514b1f8a48e4729e542f5e2ae4b14fa))

## [2.4.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v2.3.0...v2.4.0) (2023-03-08)


### Features

* add outputs for lambda and lambda log groups ([#3033](https://github.com/philips-labs/terraform-aws-github-runner/issues/3033)) ([e1ce8be](https://github.com/philips-labs/terraform-aws-github-runner/commit/e1ce8beff74896eba5b423c7510f2569078a8c01))
* **runners:** allow to use a shared encrypted AMI ([#2933](https://github.com/philips-labs/terraform-aws-github-runner/issues/2933)) ([5514c72](https://github.com/philips-labs/terraform-aws-github-runner/commit/5514c7246184152349e3dbfa09a41b49b1156e60))


### Bug Fixes

* **runners:** bump aws-sdk from 2.1289.0 to 2.1329.0 in /modules/runners/lambdas/runners ([#3018](https://github.com/philips-labs/terraform-aws-github-runner/issues/3018)) ([9bfcfe6](https://github.com/philips-labs/terraform-aws-github-runner/commit/9bfcfe642a1d56ded7e65c190d31539c9ccc1336))
* **webhook:** bump @aws-sdk/client-ssm from 3.278.0 to 3.282.0 in /modules/webhook/lambdas/webhook ([#3021](https://github.com/philips-labs/terraform-aws-github-runner/issues/3021)) ([7b7c211](https://github.com/philips-labs/terraform-aws-github-runner/commit/7b7c211e15f8e5e57c2866c6a9656399fdd2305e))

## [2.3.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v2.2.2...v2.3.0) (2023-03-01)


### Features

* **syncer:** add option to disable runner syncer lambda trigger ([#2986](https://github.com/philips-labs/terraform-aws-github-runner/issues/2986)) ([5eb27b0](https://github.com/philips-labs/terraform-aws-github-runner/commit/5eb27b0fcf3bf01561f7ec25cada9f9d7bb0407e))


### Bug Fixes

* **runners:** bump @aws-sdk/client-ssm from 3.272.0 to 3.281.0 in /modules/runners/lambdas/runners ([#3014](https://github.com/philips-labs/terraform-aws-github-runner/issues/3014)) ([7c390ba](https://github.com/philips-labs/terraform-aws-github-runner/commit/7c390bae884dda5155d37f34e55600c8fa9023b5))
* **runners:** propagate var.runner_ec2_tags to EC2 volumes ([#2985](https://github.com/philips-labs/terraform-aws-github-runner/issues/2985)) ([a9b1fa8](https://github.com/philips-labs/terraform-aws-github-runner/commit/a9b1fa85475214f4d1de5fab1e070ed4fad978b0))
* **webhook:** bump @aws-sdk/client-sqs from 3.264.0 to 3.279.0 in /modules/webhook/lambdas/webhook ([#3011](https://github.com/philips-labs/terraform-aws-github-runner/issues/3011)) ([9d1d3bd](https://github.com/philips-labs/terraform-aws-github-runner/commit/9d1d3bd89a76109176a87a234b1c19a01da7873a))

## [2.2.2](https://github.com/philips-labs/terraform-aws-github-runner/compare/v2.2.1...v2.2.2) (2023-02-24)


### Bug Fixes

* **runners:** bump @aws-sdk/client-ssm from 3.245.0 to 3.272.0 in /modules/runners/lambdas/runners ([#2971](https://github.com/philips-labs/terraform-aws-github-runner/issues/2971)) ([a1c700f](https://github.com/philips-labs/terraform-aws-github-runner/commit/a1c700f00fdeae436e4e3d02740d41cab980de3b))
* **runners:** Fix typo in .setup_info generated in start-runner.ps1. ([#2967](https://github.com/philips-labs/terraform-aws-github-runner/issues/2967)) ([e8f74bc](https://github.com/philips-labs/terraform-aws-github-runner/commit/e8f74bca0e97247845968fdd4a5bd4b707e25d73))
* **webhook:** bump @aws-sdk/client-ssm from 3.245.0 to 3.278.0 in /modules/webhook/lambdas/webhook ([#2990](https://github.com/philips-labs/terraform-aws-github-runner/issues/2990)) ([b61c2bf](https://github.com/philips-labs/terraform-aws-github-runner/commit/b61c2bf9a5ac17a0d90e0c21f18ff949cb22f57b))
* **webhook:** bump @octokit/rest from 19.0.5 to 19.0.7 in /modules/webhook/lambdas/webhook ([#2980](https://github.com/philips-labs/terraform-aws-github-runner/issues/2980)) ([8a5a8ae](https://github.com/philips-labs/terraform-aws-github-runner/commit/8a5a8ae69a612623496f8ee1b06126e052f86d0d))

## [2.2.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v2.2.0...v2.2.1) (2023-02-17)


### Bug Fixes

* **binary-syncer:** Allow lambda inside VPC ([#2938](https://github.com/philips-labs/terraform-aws-github-runner/issues/2938)) ([4bb80be](https://github.com/philips-labs/terraform-aws-github-runner/commit/4bb80be972a3b23e2914486bef0af791dc4a0c89))
* **runners:** bump @octokit/auth-app from 4.0.8 to 4.0.9 in /modules/runners/lambdas/runners ([#2953](https://github.com/philips-labs/terraform-aws-github-runner/issues/2953)) ([fce2a75](https://github.com/philips-labs/terraform-aws-github-runner/commit/fce2a75f364d64497f5524e7d500085ba651d53c))
* **runners:** Fix incorrect path to SSM cloudwatch config parameter. ([8f4cc41](https://github.com/philips-labs/terraform-aws-github-runner/commit/8f4cc4187b547c8d1e00f2c445db88b477aec31b))
* **runners:** Fix path to SSM cloudwatch config parameter on Windows ([#2922](https://github.com/philips-labs/terraform-aws-github-runner/issues/2922)) ([8f4cc41](https://github.com/philips-labs/terraform-aws-github-runner/commit/8f4cc4187b547c8d1e00f2c445db88b477aec31b))
* **syncer:** bump axios from 1.2.2 to 1.3.3 in /modules/runner-binaries-syncer/lambdas/runner-binaries-syncer ([#2959](https://github.com/philips-labs/terraform-aws-github-runner/issues/2959)) ([1aa261e](https://github.com/philips-labs/terraform-aws-github-runner/commit/1aa261e594fe5fdef8097258be7fccb0e6e306e2))

## [2.2.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v2.1.1...v2.2.0) (2023-02-10)


### Features

* Add runner logfiles to output ([#2858](https://github.com/philips-labs/terraform-aws-github-runner/issues/2858)) ([a1013e9](https://github.com/philips-labs/terraform-aws-github-runner/commit/a1013e91f0fe380ff7988e20e9efea78e73acea6))


### Bug Fixes

* Add missing entry for AWS-recommended price-capacity-optimized strategy to ProcessEnv interface ([9b8f88b](https://github.com/philips-labs/terraform-aws-github-runner/commit/9b8f88ba275cde40ce2b33ff51aae55b094928a9))
* Adds InsufficientInstanceCapacity to list of scaling errors ([4eb3b16](https://github.com/philips-labs/terraform-aws-github-runner/commit/4eb3b16b0dfd60fafde6843fa9f8c95399db3f8b))
* **multi-runner:** Create DLQ only if requested ([#2903](https://github.com/philips-labs/terraform-aws-github-runner/issues/2903)) ([3d33744](https://github.com/philips-labs/terraform-aws-github-runner/commit/3d337447158196e5cff5ddae78c6d867e103696d))
* **multi-runner:** Missing ami_id_ssm_parameter_name parameter from multi-runner [#2883](https://github.com/philips-labs/terraform-aws-github-runner/issues/2883) ([#2911](https://github.com/philips-labs/terraform-aws-github-runner/issues/2911)) ([19138d9](https://github.com/philips-labs/terraform-aws-github-runner/commit/19138d9ee9d3abcf16f684782f2a51d32986d636))
* **runner:** Adds InsufficientInstanceCapacity to list of scaling errors ([#2926](https://github.com/philips-labs/terraform-aws-github-runner/issues/2926)) ([4eb3b16](https://github.com/philips-labs/terraform-aws-github-runner/commit/4eb3b16b0dfd60fafde6843fa9f8c95399db3f8b))
* **runners:** Add missing entry for AWS-recommended price-capacity-optimized strategy to ProcessEnv interface ([#2921](https://github.com/philips-labs/terraform-aws-github-runner/issues/2921)) ([9b8f88b](https://github.com/philips-labs/terraform-aws-github-runner/commit/9b8f88ba275cde40ce2b33ff51aae55b094928a9))
* **runners:** Bump @octokit/types from 8.0.0 to 9.0.0 in /modules/runners/lambdas/runners ([#2910](https://github.com/philips-labs/terraform-aws-github-runner/issues/2910)) ([abdc3ac](https://github.com/philips-labs/terraform-aws-github-runner/commit/abdc3ac0fc166d58dd3a990e622c66b5e25b8e98))
* **runners:** Bump cron-parser from 4.7.0 to 4.7.1 in /modules/runners/lambdas/runners ([#2893](https://github.com/philips-labs/terraform-aws-github-runner/issues/2893)) ([fd2dc78](https://github.com/philips-labs/terraform-aws-github-runner/commit/fd2dc78e83b15f6f6f554a1360fbd8305e0a3a2b))
* **syncer:** bump aws-sdk from 2.1290.0 to 2.1312.0 in /modules/runner-binaries-syncer/lambdas/runner-binaries-syncer ([#2940](https://github.com/philips-labs/terraform-aws-github-runner/issues/2940)) ([8d1b281](https://github.com/philips-labs/terraform-aws-github-runner/commit/8d1b28170814cf3968d3796f954d0080923ee736))
* **webhook:** Bump @octokit/webhooks from 10.4.0 to 10.7.0 in /modules/webhook/lambdas/webhook ([#2907](https://github.com/philips-labs/terraform-aws-github-runner/issues/2907)) ([d9ab310](https://github.com/philips-labs/terraform-aws-github-runner/commit/d9ab31051f3ccc6dceeda67038fdf47a0636445b))


### Performance Improvements

* **webhook:** Use @aws-sdk/client-sqs in the webhook Lambda ([#2924](https://github.com/philips-labs/terraform-aws-github-runner/issues/2924)) ([b8898ef](https://github.com/philips-labs/terraform-aws-github-runner/commit/b8898ef1034e06bdb01ee4f2f2215c2ec51b22c5))

## [2.1.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v2.1.0...v2.1.1) (2023-01-12)


### Bug Fixes

* Honnor booting instance in runner pool ([#2801](https://github.com/philips-labs/terraform-aws-github-runner/issues/2801)) ([9f841f7](https://github.com/philips-labs/terraform-aws-github-runner/commit/9f841f7ffc0b1d3bb805bedaeb12e462eb74f835))
* **runners:** Bump @aws-sdk/client-ssm from 3.241.0 to 3.245.0 in /modules/runners/lambdas/runners ([#2866](https://github.com/philips-labs/terraform-aws-github-runner/issues/2866)) ([ca6a0bb](https://github.com/philips-labs/terraform-aws-github-runner/commit/ca6a0bbc84d0168f9bc6dbe66a9d75de3339caf4))
* **runners:** Bump @octokit/auth-app from 4.0.7 to 4.0.8 in /modules/runners/lambdas/runners ([#2870](https://github.com/philips-labs/terraform-aws-github-runner/issues/2870)) ([755796f](https://github.com/philips-labs/terraform-aws-github-runner/commit/755796f62a13a910e15281d08a15903df797a699))
* **runners:** Bump luxon from 3.1.1 to 3.2.1 in /modules/runners/lambdas/runners ([#2860](https://github.com/philips-labs/terraform-aws-github-runner/issues/2860)) ([159a1ef](https://github.com/philips-labs/terraform-aws-github-runner/commit/159a1ef42e17a15907ca12a3f5fb1d9d2900f69a))
* **syncer:** Bump aws-sdk from 2.1284.0 to 2.1290.0 in /modules/runner-binaries-syncer/lambdas/runner-binaries-syncer ([#2871](https://github.com/philips-labs/terraform-aws-github-runner/issues/2871)) ([f8c027d](https://github.com/philips-labs/terraform-aws-github-runner/commit/f8c027def8c21094a171f804cf03f832ba913ad2))
* **webhook:** Bump @aws-sdk/client-ssm from 3.238.0 to 3.245.0 in /modules/webhook/lambdas/webhook ([#2872](https://github.com/philips-labs/terraform-aws-github-runner/issues/2872)) ([c50a773](https://github.com/philips-labs/terraform-aws-github-runner/commit/c50a773cfdeb81ad7bc39f85ea4fe075aab727ce))
* **webhook:** Bump aws-sdk from 2.1289.0 to 2.1292.0 in /modules/webhook/lambdas/webhook ([#2876](https://github.com/philips-labs/terraform-aws-github-runner/issues/2876)) ([b3507af](https://github.com/philips-labs/terraform-aws-github-runner/commit/b3507af2f285f86e6435d43eed75c378fb8e43b9))

## [2.1.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v2.0.2...v2.1.0) (2023-01-06)


### Features

* **runners:** Add delay to prevent ssm rate limits using setTimeout ([#2823](https://github.com/philips-labs/terraform-aws-github-runner/issues/2823)) ([1461efd](https://github.com/philips-labs/terraform-aws-github-runner/commit/1461efd925b1f13d0a2be7e8fc9b3fa8138d40fa))


### Bug Fixes

* Correction enable_enable_fifo_build_queue ([#2857](https://github.com/philips-labs/terraform-aws-github-runner/issues/2857)) ([455e272](https://github.com/philips-labs/terraform-aws-github-runner/commit/455e272b81052ad1b60b4d51aeeb1e6b84c5bdd2))
* multi runner runner label ([2840d5e](https://github.com/philips-labs/terraform-aws-github-runner/commit/2840d5e8e76b7d03259027a7ea44119cc9f3ff60))
* **runners:** Bump @aws-sdk/client-ssm from 3.238.0 to 3.241.0 in /modules/runners/lambdas/runners ([#2838](https://github.com/philips-labs/terraform-aws-github-runner/issues/2838)) ([89b1839](https://github.com/philips-labs/terraform-aws-github-runner/commit/89b18395e41d02b1ce51339cc20dad3781ab7019))
* **runners:** Bump aws-sdk from 2.1284.0 to 2.1289.0 in /modules/runners/lambdas/runners ([#2855](https://github.com/philips-labs/terraform-aws-github-runner/issues/2855)) ([402e5ac](https://github.com/philips-labs/terraform-aws-github-runner/commit/402e5ac1515729140bc4d5c8e213219cf576c7b3))
* Variable enable_enable_fifo_build_queue -&gt; enable_enable_fifo_build_queue ([455e272](https://github.com/philips-labs/terraform-aws-github-runner/commit/455e272b81052ad1b60b4d51aeeb1e6b84c5bdd2))
* **webhook:** Bump aws-sdk from 2.1284.0 to 2.1289.0 in /modules/webhook/lambdas/webhook ([#2856](https://github.com/philips-labs/terraform-aws-github-runner/issues/2856)) ([5d6dd37](https://github.com/philips-labs/terraform-aws-github-runner/commit/5d6dd3797b5dfe5374345c838bc2bfc4f2819569))
* **webhook:** Bump axios from 1.2.1 to 1.2.2 in /modules/runner-binaries-syncer/lambdas/runner-binaries-syncer ([#2827](https://github.com/philips-labs/terraform-aws-github-runner/issues/2827)) ([686624a](https://github.com/philips-labs/terraform-aws-github-runner/commit/686624a6acb638fd62febc9b41abe67b00010a47))

## [2.0.2](https://github.com/philips-labs/terraform-aws-github-runner/compare/v2.0.1...v2.0.2) (2023-01-03)


### Bug Fixes

* **runners:** Bump json5 from 2.2.1 to 2.2.3 in /modules/runners/lambdas/runners ([#2842](https://github.com/philips-labs/terraform-aws-github-runner/issues/2842)) ([d3169c2](https://github.com/philips-labs/terraform-aws-github-runner/commit/d3169c2a1c9782f408d0a2eb2a0a45e40ceb0650))
* **syncer:** Bump json5 from 2.2.1 to 2.2.3 in /modules/runner-binaries-syncer/lambdas/runner-binaries-syncer ([#2841](https://github.com/philips-labs/terraform-aws-github-runner/issues/2841)) ([b2816f7](https://github.com/philips-labs/terraform-aws-github-runner/commit/b2816f758b364cb41bc4a1839ea188f8c0bc035e))
* **webhook:** Bump json5 from 2.2.1 to 2.2.3 in /modules/webhook/lambdas/webhook ([#2840](https://github.com/philips-labs/terraform-aws-github-runner/issues/2840)) ([68ff414](https://github.com/philips-labs/terraform-aws-github-runner/commit/68ff4149706b6610410f398b2ceaa8d593d48544))

## [2.0.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v2.0.0...v2.0.1) (2023-01-03)


### Bug Fixes

* Restore lost changes during merging next ([#2824](https://github.com/philips-labs/terraform-aws-github-runner/issues/2824)) ([219cb9b](https://github.com/philips-labs/terraform-aws-github-runner/commit/219cb9b55bf7300f45d6870a8dfe8ed8c799f9db))

## [2.0.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.18.2...v2.0.0) (2022-12-28)

## Migrations direction
See the [GitHub release](https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v2.0.0) for migration directions

### ⚠ BREAKING CHANGES

* Set default lambda node runtime to 18x on arm64 ([#2763](https://github.com/philips-labs/terraform-aws-github-runner/issues/2763))
* Drop deprecated terraform variables ([#2761](https://github.com/philips-labs/terraform-aws-github-runner/issues/2761))
* use optional in variable block_device_mappings ([#2664](https://github.com/philips-labs/terraform-aws-github-runner/issues/2664))
* Organise SSM paramamters by path ([#2569](https://github.com/philips-labs/terraform-aws-github-runner/issues/2569))
* Add multi-runner capability ([#2472](https://github.com/philips-labs/terraform-aws-github-runner/issues/2472))
* Remove old scale down mechanism (< 0.19.0) ([#2519](https://github.com/philips-labs/terraform-aws-github-runner/issues/2519))
* Remove support check_run ([#2521](https://github.com/philips-labs/terraform-aws-github-runner/issues/2521))

### Features

* Add multi-runner capability ([#2472](https://github.com/philips-labs/terraform-aws-github-runner/issues/2472)) ([fef8d65](https://github.com/philips-labs/terraform-aws-github-runner/commit/fef8d6517cb545d0909f287f23a2df665afdfc43))
* Added publishing to workflow_job event queue for multi runner module. ([#2570](https://github.com/philips-labs/terraform-aws-github-runner/issues/2570)) ([a8b33b5](https://github.com/philips-labs/terraform-aws-github-runner/commit/a8b33b59b43d830aa96ac3d042dae088789cca10))
* Organise SSM paramamters by path ([#2569](https://github.com/philips-labs/terraform-aws-github-runner/issues/2569)) ([b912bb8](https://github.com/philips-labs/terraform-aws-github-runner/commit/b912bb891963517cf3c102a3bb9e37e40f09497f))
* Remove old scale down mechanism (&lt; 0.19.0) ([#2519](https://github.com/philips-labs/terraform-aws-github-runner/issues/2519)) ([7506e9d](https://github.com/philips-labs/terraform-aws-github-runner/commit/7506e9d71e204dbb2b2a79fda5d2d50d07b96382))
* Remove support check_run ([#2521](https://github.com/philips-labs/terraform-aws-github-runner/issues/2521)) ([4677619](https://github.com/philips-labs/terraform-aws-github-runner/commit/467761963af041b72cf10edc8a55a652311261af))
* Set default lambda node runtime to 18x on arm64 ([#2763](https://github.com/philips-labs/terraform-aws-github-runner/issues/2763)) ([2fd1e16](https://github.com/philips-labs/terraform-aws-github-runner/commit/2fd1e163e9d11a71ffc128deb33714e505948924))
* **webhook:** Support multiple arrays of tags is matchers. ([#2736](https://github.com/philips-labs/terraform-aws-github-runner/issues/2736)) ([d17f441](https://github.com/philips-labs/terraform-aws-github-runner/commit/d17f441c0ce115cf59cab1a8eebb679d9e4a4bdf))


### Bug Fixes

* Apply SSM changes for multi-runner ([c0051f6](https://github.com/philips-labs/terraform-aws-github-runner/commit/c0051f66f1398819c985ddef115a08a288932a17))
* Drop deprecated terraform variables ([#2761](https://github.com/philips-labs/terraform-aws-github-runner/issues/2761)) ([955bd1d](https://github.com/philips-labs/terraform-aws-github-runner/commit/955bd1d4de50b3356ac29ac2459915fad26f1062))
* Main module broken after supporting multiple labels  ([#2802](https://github.com/philips-labs/terraform-aws-github-runner/issues/2802)) ([df054e8](https://github.com/philips-labs/terraform-aws-github-runner/commit/df054e84a27d2f72820755252bd45257433636e4))
* Main module broken after supporting multiple labels for multi-runnes ([df054e8](https://github.com/philips-labs/terraform-aws-github-runner/commit/df054e84a27d2f72820755252bd45257433636e4))
* **multi-runner:** Add missing default for runner_metadata_options ([#2690](https://github.com/philips-labs/terraform-aws-github-runner/issues/2690)) ([910b91c](https://github.com/philips-labs/terraform-aws-github-runner/commit/910b91c89f9a8c3fc8601773235632b663f54592))
* **multi-runner:** Default value validation error ([#2685](https://github.com/philips-labs/terraform-aws-github-runner/issues/2685)) ([448a3a7](https://github.com/philips-labs/terraform-aws-github-runner/commit/448a3a7e25c8db8bb4f0e85b10e49c76c5c76778))
* Multiirunner dl queue. ([#2644](https://github.com/philips-labs/terraform-aws-github-runner/issues/2644)) ([0823d47](https://github.com/philips-labs/terraform-aws-github-runner/commit/0823d47ce1988ecdb8ddb771c9c2539a7f76e0ba))
* Remove extraneous slashes from SSM paths, other typos ([#2765](https://github.com/philips-labs/terraform-aws-github-runner/issues/2765)) ([7cdef21](https://github.com/philips-labs/terraform-aws-github-runner/commit/7cdef212c601cc8ba6ac3311b2b991852967279b))
* **runners:** Remove Application legacy tag ([#2705](https://github.com/philips-labs/terraform-aws-github-runner/issues/2705)) ([96ced8a](https://github.com/philips-labs/terraform-aws-github-runner/commit/96ced8a11f7e8885efaf50afbcc71a50f1a8c0d4))
* **webhook:** Add missing test dependency ([086a2e1](https://github.com/philips-labs/terraform-aws-github-runner/commit/086a2e17dc61851ecf1f3cf2bb9ce0465cd2199b))


### Code Refactoring

* use optional in variable block_device_mappings ([#2664](https://github.com/philips-labs/terraform-aws-github-runner/issues/2664)) ([08c484c](https://github.com/philips-labs/terraform-aws-github-runner/commit/08c484c3cda0bced87174857c0643eb26dc81317))

## [1.18.2](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.18.1...v1.18.2) (2022-12-28)


### Bug Fixes

* Update dependencies ([#2804](https://github.com/philips-labs/terraform-aws-github-runner/issues/2804)) ([1cce2ab](https://github.com/philips-labs/terraform-aws-github-runner/commit/1cce2abe16284915ba88e6295448f4906eb05c56))

## [1.18.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.18.0...v1.18.1) (2022-12-23)


### Bug Fixes

* Upgrade all non-breaking node dependencies ([#2759](https://github.com/philips-labs/terraform-aws-github-runner/issues/2759)) ([801e01f](https://github.com/philips-labs/terraform-aws-github-runner/commit/801e01f290407975aea11b85e44ac9743f9173cb))

## [1.18.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.17.0...v1.18.0) (2022-12-09)


### Features

* Support price-capacity-optimized strategy ([#2718](https://github.com/philips-labs/terraform-aws-github-runner/issues/2718)) ([ef08afb](https://github.com/philips-labs/terraform-aws-github-runner/commit/ef08afb2b5594b9f60b15dbb60687ba91c27d668))


### Bug Fixes

* added permissions for lambda to attach lambda to the VPC. ([#2734](https://github.com/philips-labs/terraform-aws-github-runner/issues/2734)) ([fb72ee8](https://github.com/philips-labs/terraform-aws-github-runner/commit/fb72ee8f6751ebe22f7453a58373f4a983b7ba3c))

## [1.17.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.16.1...v1.17.0) (2022-11-30)


### Features

* **runners:** Namespace `Application` tag ([#2182](https://github.com/philips-labs/terraform-aws-github-runner/issues/2182)) ([a1a47a4](https://github.com/philips-labs/terraform-aws-github-runner/commit/a1a47a4a18fe500ea58481dd29cbd95ce45c9bb5))


### Bug Fixes

* Adding missing input lambda vpc vars to syncer module ([#2701](https://github.com/philips-labs/terraform-aws-github-runner/issues/2701)) ([c91a96b](https://github.com/philips-labs/terraform-aws-github-runner/commit/c91a96bcc95defa0dc1e6bff71b3f607b5523bb5))

## [1.16.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.16.0...v1.16.1) (2022-11-18)


### Bug Fixes

* added runner labels to output. ([#2669](https://github.com/philips-labs/terraform-aws-github-runner/issues/2669)) ([4726c1a](https://github.com/philips-labs/terraform-aws-github-runner/commit/4726c1a2bd074e4018e2b9d0652a8ce1881ae0aa))

## [1.16.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.15.1...v1.16.0) (2022-11-18)


### Features

* Added runner labels as output. ([a3b1133](https://github.com/philips-labs/terraform-aws-github-runner/commit/a3b113359ca8c90d6f35552f436b9047f2972066))

## [1.15.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.15.0...v1.15.1) (2022-11-17)


### Bug Fixes

* Updated the fifo flag for deadletter queue. ([#2641](https://github.com/philips-labs/terraform-aws-github-runner/issues/2641)) ([a8b1645](https://github.com/philips-labs/terraform-aws-github-runner/commit/a8b1645bea0d5ef05f5eb65651eeea99bcf49ade))

## [1.15.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.14.0...v1.15.0) (2022-11-08)


### Features

* Allow to toggle access to EC2 instance tags ([#2592](https://github.com/philips-labs/terraform-aws-github-runner/issues/2592)) ([55fba22](https://github.com/philips-labs/terraform-aws-github-runner/commit/55fba22474fa802f781d46e5f3e1513c354d3a38))


### Bug Fixes

* Use aws_partition for govcloud users in ami_id_ssm_parameter_read policy definition ([#2614](https://github.com/philips-labs/terraform-aws-github-runner/issues/2614)) ([7ac65e5](https://github.com/philips-labs/terraform-aws-github-runner/commit/7ac65e589b1283f832bbe7e1264a45e00e9c8340))

## [1.14.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.13.0...v1.14.0) (2022-10-31)


### Features

* Experimental feature - Duplicate workflow job event to extra queue ([#2268](https://github.com/philips-labs/terraform-aws-github-runner/issues/2268)) ([ac046b8](https://github.com/philips-labs/terraform-aws-github-runner/commit/ac046b8eb2a0d2d5e2219ae9ee0023fd8bdf7460))
* **runners:** Add support for looking up runner AMI ID from an SSM parameter at instance launch time ([#2520](https://github.com/philips-labs/terraform-aws-github-runner/issues/2520)) ([68e2381](https://github.com/philips-labs/terraform-aws-github-runner/commit/68e238196877896332d36e264a64ca61a0af7ade))


### Bug Fixes

* replacing deprecated set-output in workflow ([#2564](https://github.com/philips-labs/terraform-aws-github-runner/issues/2564)) ([aa0afdd](https://github.com/philips-labs/terraform-aws-github-runner/commit/aa0afddda56ab92e37fc20b5a4448cc999786023))

## [1.13.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.12.0...v1.13.0) (2022-10-14)

### Features

* Experimental feature - Duplicate workflow job event to extra queue ([#2268](https://github.com/philips-labs/terraform-aws-github-runner/issues/2268)) ([985e722](https://github.com/philips-labs/terraform-aws-github-runner/commit/985e722229ce464235d206484df3d989db03e143))

## [1.12.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.11.0...v1.12.0) (2022-10-12)


### Features

* Added the AMI to machine setup info to runner workflows. ([#2451](https://github.com/philips-labs/terraform-aws-github-runner/issues/2451)) ([e197cbd](https://github.com/philips-labs/terraform-aws-github-runner/commit/e197cbddb4837840ab62c1189d069acf5f59afdb))
* **images:** add ami for windows core 2022 ([#2390](https://github.com/philips-labs/terraform-aws-github-runner/issues/2390)) ([97707c2](https://github.com/philips-labs/terraform-aws-github-runner/commit/97707c20c3110823480119fadacd95825fadff6e))
* Log workflow id in webhook ([#2511](https://github.com/philips-labs/terraform-aws-github-runner/issues/2511)) ([204acf1](https://github.com/philips-labs/terraform-aws-github-runner/commit/204acf1d1d25322c42353505aacc5594cc4e6f9c))
* Security improvements, add option to disable userdata logging ([9a9e2ee](https://github.com/philips-labs/terraform-aws-github-runner/commit/9a9e2ee1089b95950d2d142a720a68eb55e53d55)), closes [#1019](https://github.com/philips-labs/terraform-aws-github-runner/issues/1019) [#899](https://github.com/philips-labs/terraform-aws-github-runner/issues/899) [#1080](https://github.com/philips-labs/terraform-aws-github-runner/issues/1080) [#748](https://github.com/philips-labs/terraform-aws-github-runner/issues/748) [#1112](https://github.com/philips-labs/terraform-aws-github-runner/issues/1112) [#903](https://github.com/philips-labs/terraform-aws-github-runner/issues/903) [#1082](https://github.com/philips-labs/terraform-aws-github-runner/issues/1082) [#1133](https://github.com/philips-labs/terraform-aws-github-runner/issues/1133) [#2](https://github.com/philips-labs/terraform-aws-github-runner/issues/2) [#1204](https://github.com/philips-labs/terraform-aws-github-runner/issues/1204) [#1219](https://github.com/philips-labs/terraform-aws-github-runner/issues/1219) [#1202](https://github.com/philips-labs/terraform-aws-github-runner/issues/1202) [#1202](https://github.com/philips-labs/terraform-aws-github-runner/issues/1202) [#1135](https://github.com/philips-labs/terraform-aws-github-runner/issues/1135) [#1164](https://github.com/philips-labs/terraform-aws-github-runner/issues/1164) [#1154](https://github.com/philips-labs/terraform-aws-github-runner/issues/1154) [#1207](https://github.com/philips-labs/terraform-aws-github-runner/issues/1207) [#1203](https://github.com/philips-labs/terraform-aws-github-runner/issues/1203) [#1247](https://github.com/philips-labs/terraform-aws-github-runner/issues/1247) [#1222](https://github.com/philips-labs/terraform-aws-github-runner/issues/1222) [#1244](https://github.com/philips-labs/terraform-aws-github-runner/issues/1244) [#1223](https://github.com/philips-labs/terraform-aws-github-runner/issues/1223) [#1254](https://github.com/philips-labs/terraform-aws-github-runner/issues/1254) [#1286](https://github.com/philips-labs/terraform-aws-github-runner/issues/1286) [#1287](https://github.com/philips-labs/terraform-aws-github-runner/issues/1287) [#1278](https://github.com/philips-labs/terraform-aws-github-runner/issues/1278) [#1354](https://github.com/philips-labs/terraform-aws-github-runner/issues/1354) [#1357](https://github.com/philips-labs/terraform-aws-github-runner/issues/1357) [#1356](https://github.com/philips-labs/terraform-aws-github-runner/issues/1356) [#1228](https://github.com/philips-labs/terraform-aws-github-runner/issues/1228) [#1324](https://github.com/philips-labs/terraform-aws-github-runner/issues/1324) [#1358](https://github.com/philips-labs/terraform-aws-github-runner/issues/1358) [#1377](https://github.com/philips-labs/terraform-aws-github-runner/issues/1377) [#1368](https://github.com/philips-labs/terraform-aws-github-runner/issues/1368) [#1381](https://github.com/philips-labs/terraform-aws-github-runner/issues/1381) [#1415](https://github.com/philips-labs/terraform-aws-github-runner/issues/1415) [#1416](https://github.com/philips-labs/terraform-aws-github-runner/issues/1416) [#1423](https://github.com/philips-labs/terraform-aws-github-runner/issues/1423) [#1399](https://github.com/philips-labs/terraform-aws-github-runner/issues/1399) [#1401](https://github.com/philips-labs/terraform-aws-github-runner/issues/1401) [#1444](https://github.com/philips-labs/terraform-aws-github-runner/issues/1444) [#1480](https://github.com/philips-labs/terraform-aws-github-runner/issues/1480) [#1478](https://github.com/philips-labs/terraform-aws-github-runner/issues/1478) [#1479](https://github.com/philips-labs/terraform-aws-github-runner/issues/1479) [#1476](https://github.com/philips-labs/terraform-aws-github-runner/issues/1476) [#1537](https://github.com/philips-labs/terraform-aws-github-runner/issues/1537) [#1538](https://github.com/philips-labs/terraform-aws-github-runner/issues/1538) [#1541](https://github.com/philips-labs/terraform-aws-github-runner/issues/1541) [#1542](https://github.com/philips-labs/terraform-aws-github-runner/issues/1542) [#1399](https://github.com/philips-labs/terraform-aws-github-runner/issues/1399) [#1444](https://github.com/philips-labs/terraform-aws-github-runner/issues/1444) [#1572](https://github.com/philips-labs/terraform-aws-github-runner/issues/1572) [#1556](https://github.com/philips-labs/terraform-aws-github-runner/issues/1556) [#1561](https://github.com/philips-labs/terraform-aws-github-runner/issues/1561) [#1525](https://github.com/philips-labs/terraform-aws-github-runner/issues/1525) [#1591](https://github.com/philips-labs/terraform-aws-github-runner/issues/1591) [#1577](https://github.com/philips-labs/terraform-aws-github-runner/issues/1577) [#1621](https://github.com/philips-labs/terraform-aws-github-runner/issues/1621) [#1611](https://github.com/philips-labs/terraform-aws-github-runner/issues/1611) [#1615](https://github.com/philips-labs/terraform-aws-github-runner/issues/1615) [#1624](https://github.com/philips-labs/terraform-aws-github-runner/issues/1624) [#1628](https://github.com/philips-labs/terraform-aws-github-runner/issues/1628) [#1647](https://github.com/philips-labs/terraform-aws-github-runner/issues/1647) [#1644](https://github.com/philips-labs/terraform-aws-github-runner/issues/1644) [#1673](https://github.com/philips-labs/terraform-aws-github-runner/issues/1673) [#1676](https://github.com/philips-labs/terraform-aws-github-runner/issues/1676) [#1716](https://github.com/philips-labs/terraform-aws-github-runner/issues/1716) [#1741](https://github.com/philips-labs/terraform-aws-github-runner/issues/1741) [#1738](https://github.com/philips-labs/terraform-aws-github-runner/issues/1738) [#1745](https://github.com/philips-labs/terraform-aws-github-runner/issues/1745) [#1718](https://github.com/philips-labs/terraform-aws-github-runner/issues/1718) [#1791](https://github.com/philips-labs/terraform-aws-github-runner/issues/1791) [github.com/philips-labs/terraform-aws-github-runner/pull/1816#issuecomment-1060650668](https://github.com/philips-labs/github.com/philips-labs/terraform-aws-github-runner/pull/1816/issues/issuecomment-1060650668) [#1816](https://github.com/philips-labs/terraform-aws-github-runner/issues/1816) [#1833](https://github.com/philips-labs/terraform-aws-github-runner/issues/1833) [#1798](https://github.com/philips-labs/terraform-aws-github-runner/issues/1798) [#1815](https://github.com/philips-labs/terraform-aws-github-runner/issues/1815) [#1838](https://github.com/philips-labs/terraform-aws-github-runner/issues/1838) [#1797](https://github.com/philips-labs/terraform-aws-github-runner/issues/1797) [#1839](https://github.com/philips-labs/terraform-aws-github-runner/issues/1839) [#1812](https://github.com/philips-labs/terraform-aws-github-runner/issues/1812) [#1854](https://github.com/philips-labs/terraform-aws-github-runner/issues/1854) [#1855](https://github.com/philips-labs/terraform-aws-github-runner/issues/1855) [#1845](https://github.com/philips-labs/terraform-aws-github-runner/issues/1845) [#1832](https://github.com/philips-labs/terraform-aws-github-runner/issues/1832) [#1859](https://github.com/philips-labs/terraform-aws-github-runner/issues/1859) [#1937](https://github.com/philips-labs/terraform-aws-github-runner/issues/1937) [#1969](https://github.com/philips-labs/terraform-aws-github-runner/issues/1969) [#1970](https://github.com/philips-labs/terraform-aws-github-runner/issues/1970) [#1954](https://github.com/philips-labs/terraform-aws-github-runner/issues/1954) [#2019](https://github.com/philips-labs/terraform-aws-github-runner/issues/2019) [#1739](https://github.com/philips-labs/terraform-aws-github-runner/issues/1739) [#2019](https://github.com/philips-labs/terraform-aws-github-runner/issues/2019) [#2024](https://github.com/philips-labs/terraform-aws-github-runner/issues/2024) [#2051](https://github.com/philips-labs/terraform-aws-github-runner/issues/2051) [#1858](https://github.com/philips-labs/terraform-aws-github-runner/issues/1858) [#2085](https://github.com/philips-labs/terraform-aws-github-runner/issues/2085) [#2121](https://github.com/philips-labs/terraform-aws-github-runner/issues/2121) [#2073](https://github.com/philips-labs/terraform-aws-github-runner/issues/2073) [#2146](https://github.com/philips-labs/terraform-aws-github-runner/issues/2146) [#2145](https://github.com/philips-labs/terraform-aws-github-runner/issues/2145) [#2147](https://github.com/philips-labs/terraform-aws-github-runner/issues/2147) [#2122](https://github.com/philips-labs/terraform-aws-github-runner/issues/2122) [#2123](https://github.com/philips-labs/terraform-aws-github-runner/issues/2123) [#2181](https://github.com/philips-labs/terraform-aws-github-runner/issues/2181) [#2207](https://github.com/philips-labs/terraform-aws-github-runner/issues/2207) [#2102](https://github.com/philips-labs/terraform-aws-github-runner/issues/2102) [#2214](https://github.com/philips-labs/terraform-aws-github-runner/issues/2214) [#2052](https://github.com/philips-labs/terraform-aws-github-runner/issues/2052) [#2074](https://github.com/philips-labs/terraform-aws-github-runner/issues/2074) [#2233](https://github.com/philips-labs/terraform-aws-github-runner/issues/2233) [#2288](https://github.com/philips-labs/terraform-aws-github-runner/issues/2288) [#2302](https://github.com/philips-labs/terraform-aws-github-runner/issues/2302) [#2291](https://github.com/philips-labs/terraform-aws-github-runner/issues/2291) [#2209](https://github.com/philips-labs/terraform-aws-github-runner/issues/2209) [#2315](https://github.com/philips-labs/terraform-aws-github-runner/issues/2315) [#2314](https://github.com/philips-labs/terraform-aws-github-runner/issues/2314) [#2103](https://github.com/philips-labs/terraform-aws-github-runner/issues/2103) [#2345](https://github.com/philips-labs/terraform-aws-github-runner/issues/2345) [#2387](https://github.com/philips-labs/terraform-aws-github-runner/issues/2387) [#2371](https://github.com/philips-labs/terraform-aws-github-runner/issues/2371) [#2431](https://github.com/philips-labs/terraform-aws-github-runner/issues/2431) [#2369](https://github.com/philips-labs/terraform-aws-github-runner/issues/2369) [#2346](https://github.com/philips-labs/terraform-aws-github-runner/issues/2346) [#2325](https://github.com/philips-labs/terraform-aws-github-runner/issues/2325) [#2434](https://github.com/philips-labs/terraform-aws-github-runner/issues/2434) [#2455](https://github.com/philips-labs/terraform-aws-github-runner/issues/2455)


### Bug Fixes

* Remove resource group from module ([#2512](https://github.com/philips-labs/terraform-aws-github-runner/issues/2512)) ([2628352](https://github.com/philips-labs/terraform-aws-github-runner/commit/262835219d220b5d93ccee92c5e1a1909f3e6780))

## [1.11.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.10.0...v1.11.0) (2022-10-06)


### Features

* Support s3 bucket logging for distribution cache bucket ([#2430](https://github.com/philips-labs/terraform-aws-github-runner/issues/2430)) ([69578e0](https://github.com/philips-labs/terraform-aws-github-runner/commit/69578e0d1d381a11e359ea68957b5a3b27fad5a5))

## [1.10.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.9.1...v1.10.0) (2022-09-24)


### Features

* Download runner release via latest release API ([#2455](https://github.com/philips-labs/terraform-aws-github-runner/issues/2455)) ([e75e092](https://github.com/philips-labs/terraform-aws-github-runner/commit/e75e092f328dcba40f2d970a090dd6d16b5dd9d7))

## [1.9.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.9.0...v1.9.1) (2022-09-18)


### Bug Fixes

* **webhook:** Use `x-hub-signature-256` header as default ([#2434](https://github.com/philips-labs/terraform-aws-github-runner/issues/2434)) ([9c3e495](https://github.com/philips-labs/terraform-aws-github-runner/commit/9c3e495295e6fbd34e655bd3853b6bf631436925))

## [1.9.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.8.1...v1.9.0) (2022-09-16)


### Features

* Add option to enable access log for API gateway ([#2387](https://github.com/philips-labs/terraform-aws-github-runner/issues/2387)) ([fcd9fba](https://github.com/philips-labs/terraform-aws-github-runner/commit/fcd9fbace1df963a7b86862ecfbbae7b33a867b4))
* add s3_location_runner_distribution var as expandable for userdata ([#2371](https://github.com/philips-labs/terraform-aws-github-runner/issues/2371)) ([05fe737](https://github.com/philips-labs/terraform-aws-github-runner/commit/05fe737375da38d4779af5acdc5c8256718109c4))
* Encrypted data at REST on SQS by default ([#2431](https://github.com/philips-labs/terraform-aws-github-runner/issues/2431)) ([7f3f4bf](https://github.com/philips-labs/terraform-aws-github-runner/commit/7f3f4bf53673afcde2335bf763f7d40912880e44))
* **images:** Allow passing instance type when building windows image ([#2369](https://github.com/philips-labs/terraform-aws-github-runner/issues/2369)) ([eca23bf](https://github.com/philips-labs/terraform-aws-github-runner/commit/eca23bffe9a219d3dc66028149f5cb2d8c7eca35))


### Bug Fixes

* **runners:** Fetch instance environment tag though metadata ([#2346](https://github.com/philips-labs/terraform-aws-github-runner/issues/2346)) ([27db290](https://github.com/philips-labs/terraform-aws-github-runner/commit/27db29046f3a23240a6a28c255cc9354d7c1804d))
* **runners:** Set the default Windows AMI to Server 2022 ([#2325](https://github.com/philips-labs/terraform-aws-github-runner/issues/2325)) ([78e99d1](https://github.com/philips-labs/terraform-aws-github-runner/commit/78e99d1c80587b8cfebedde5c5f2d615300d417d))

## [1.8.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.8.0...v1.8.1) (2022-08-17)


### Bug Fixes

* **runners:** Pass allocation strategy ([#2345](https://github.com/philips-labs/terraform-aws-github-runner/issues/2345)) ([68d3445](https://github.com/philips-labs/terraform-aws-github-runner/commit/68d3445036babd5efa2e3077597b6ab6b958128e))

## [1.8.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.7.0...v1.8.0) (2022-08-15)


### Features

* Add option to disable lambda to sync runner binaries ([#2314](https://github.com/philips-labs/terraform-aws-github-runner/issues/2314)) ([9f7d32d](https://github.com/philips-labs/terraform-aws-github-runner/commit/9f7d32d7edd724ee015a053dc1914a4b871aafe1))


### Bug Fixes

* **examples:** Upgrading ubuntu example to 22.04 ([#2250](https://github.com/philips-labs/terraform-aws-github-runner/issues/2250)) ([d4b7650](https://github.com/philips-labs/terraform-aws-github-runner/commit/d4b7650312274594a0f5274abccf99c66b594966)), closes [#2103](https://github.com/philips-labs/terraform-aws-github-runner/issues/2103)

## [1.7.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.6.0...v1.7.0) (2022-08-04)


### Features

* Webhook accept jobs where not all labels are provided in job. ([#2209](https://github.com/philips-labs/terraform-aws-github-runner/issues/2209)) ([6d9116f](https://github.com/philips-labs/terraform-aws-github-runner/commit/6d9116fe9a8b8620691d4af8aa6c6d6e0003b502))


### Bug Fixes

* Ignore case for runner labels. ([#2315](https://github.com/philips-labs/terraform-aws-github-runner/issues/2315)) ([014985a](https://github.com/philips-labs/terraform-aws-github-runner/commit/014985a567e05e74713126fe7913d1ce0a66250e))

## [1.6.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.5.0...v1.6.0) (2022-08-03)


### Features

* Add options extra option to ebs block device mapping ([#2052](https://github.com/philips-labs/terraform-aws-github-runner/issues/2052)) ([7cd2524](https://github.com/philips-labs/terraform-aws-github-runner/commit/7cd2524ed0dba38849ac1e0e477cffda24bf21a3))
* Enable node16 default ([#2074](https://github.com/philips-labs/terraform-aws-github-runner/issues/2074)) ([58aa5ed](https://github.com/philips-labs/terraform-aws-github-runner/commit/58aa5ed8a3f09a09b459122b5e7265f98777d59b))


### Bug Fixes

* Incorrect path of Runner logs ([#2233](https://github.com/philips-labs/terraform-aws-github-runner/issues/2233)) ([98eff98](https://github.com/philips-labs/terraform-aws-github-runner/commit/98eff98158381bd57d59e9a54efc3ee5db294110))
* Preventing that lambda webhook fails when it tries to process an installation_repositories event ([#2288](https://github.com/philips-labs/terraform-aws-github-runner/issues/2288)) ([8656c83](https://github.com/philips-labs/terraform-aws-github-runner/commit/8656c83ec250e461062a2f4415c31f7c5186bef9))
* Update ubuntu example to fix /opt/hostedtoolcache ([#2302](https://github.com/philips-labs/terraform-aws-github-runner/issues/2302)) ([8eea748](https://github.com/philips-labs/terraform-aws-github-runner/commit/8eea74817a9817ca386b77f1b90ae9ef721e250e))
* Webhook lambda misleading log ([#2291](https://github.com/philips-labs/terraform-aws-github-runner/issues/2291)) ([c6275f9](https://github.com/philips-labs/terraform-aws-github-runner/commit/c6275f9d5a68c962e32596e4abf77b1fda6dd18f))


## [1.5.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.4.1...v1.5.0) (2022-07-08)


### Features

* Add ubuntu-jammy example image based on existing ubuntu-focal ([#2102](https://github.com/philips-labs/terraform-aws-github-runner/issues/2102)) ([486ae91](https://github.com/philips-labs/terraform-aws-github-runner/commit/486ae9122420f621aa1c61fd4f21aff3f4e9d39e))


### Bug Fixes

* **images:** avoid wrong AMI could be selected for ubuntu focal ([#2214](https://github.com/philips-labs/terraform-aws-github-runner/issues/2214)) ([76be94b](https://github.com/philips-labs/terraform-aws-github-runner/commit/76be94beda6c13c75145c7c79dae888bdb647da3))

## [1.4.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.4.0...v1.4.1) (2022-06-30)


### Bug Fixes

* added server_side_encryption key to download trigger for distribution ([#2207](https://github.com/philips-labs/terraform-aws-github-runner/issues/2207)) ([404e3b6](https://github.com/philips-labs/terraform-aws-github-runner/commit/404e3b6fa5e2d0037a7bc8fe7674a887ab6504eb))

## [1.4.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.3.0...v1.4.0) (2022-06-23)


### Features

* Add option to match some of the labes instead of all [#2122](https://github.com/philips-labs/terraform-aws-github-runner/issues/2122) ([#2123](https://github.com/philips-labs/terraform-aws-github-runner/issues/2123)) ([c5e3c21](https://github.com/philips-labs/terraform-aws-github-runner/commit/c5e3c21a5c963b083ca3756a53c3e55a408c144c))


### Bug Fixes

* don't apply extra labels unless defined ([#2181](https://github.com/philips-labs/terraform-aws-github-runner/issues/2181)) ([c0b11bb](https://github.com/philips-labs/terraform-aws-github-runner/commit/c0b11bb1a78eb1a2f0453031c04f781d33d3dc17))
* Remove asterik in permission for runner lambda to describe instances ([9b9da03](https://github.com/philips-labs/terraform-aws-github-runner/commit/9b9da036a723305531bd4b5f66addf2f219bc1af))

## [1.3.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.2.0...v1.3.0) (2022-06-14)


### Features

* Support arm64 lambda functions ([#2121](https://github.com/philips-labs/terraform-aws-github-runner/issues/2121)) ([9e2a7b6](https://github.com/philips-labs/terraform-aws-github-runner/commit/9e2a7b69cce2f7a876bbb8c865d4cd5116299640))
* Support Node16 for AWS Lambda ([#2073](https://github.com/philips-labs/terraform-aws-github-runner/issues/2073)) ([68a2014](https://github.com/philips-labs/terraform-aws-github-runner/commit/68a2014db5e909bbf0c09bb6880f1eff2441ea7e))


### Bug Fixes

* replaced old environment variable ([#2146](https://github.com/philips-labs/terraform-aws-github-runner/issues/2146)) ([f2072f7](https://github.com/philips-labs/terraform-aws-github-runner/commit/f2072f75e9bb6c2e4979a86009a7c3fecb0b9812))
* set explicit permissions on s3 for syncer lambda ([#2145](https://github.com/philips-labs/terraform-aws-github-runner/issues/2145)) ([aa7edd1](https://github.com/philips-labs/terraform-aws-github-runner/commit/aa7edd144f64da38f4ef6ecf032118980d684fcd))
* set kms key on aws_s3_object when encryption is enabled ([#2147](https://github.com/philips-labs/terraform-aws-github-runner/issues/2147)) ([b4dc706](https://github.com/philips-labs/terraform-aws-github-runner/commit/b4dc70610b085a8a4a0f25faf9e9637a56887762))

## [1.2.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.1.1...v1.2.0) (2022-05-20)


### Features

* Replace environment variable by prefix ([#1858](https://github.com/philips-labs/terraform-aws-github-runner/issues/1858)) ([e2f9a27](https://github.com/philips-labs/terraform-aws-github-runner/commit/e2f9a2764f3c404cd2f8649db64253c9e886e2e7))

### [1.1.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.1.0...v1.1.1) (2022-05-17)


### Bug Fixes

* **runner:** Don't treat the string "false" as true. ([#2051](https://github.com/philips-labs/terraform-aws-github-runner/issues/2051)) ([b67c7dc](https://github.com/philips-labs/terraform-aws-github-runner/commit/b67c7dcbee7618f830b2365a73a2bc25f20b52b5))

## [1.1.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v1.0.0...v1.1.0) (2022-05-10)


### Features

* Add option to enable detailed monitoring for runner launch template ([#2024](https://github.com/philips-labs/terraform-aws-github-runner/issues/2024)) ([e73a267](https://github.com/philips-labs/terraform-aws-github-runner/commit/e73a267c63444a3ff07db549f9cee05fd94fc2f2))

## [1.0.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.40.4...v1.0.0) (2022-05-09)


### ⚠ BREAKING CHANGES

* var.volume_size replaced by var.block_device_mappings
* The module is upgraded to AWS Terraform provider 4.x

### Features

* Improve syncer s3 kms encryption ([38ed5be](https://github.com/philips-labs/terraform-aws-github-runner/commit/38ed5be5db8af92c5e182cd83cffb6451c330970))
* Remove var.volume_size in favour of var.block_device_mappings ([4e97048](https://github.com/philips-labs/terraform-aws-github-runner/commit/4e9704892f8f008cb467342ae5e8c565f4c68e39))
* Support AWS 4.x Terraform provider ([#1739](https://github.com/philips-labs/terraform-aws-github-runner/issues/1739)) ([cfb6da2](https://github.com/philips-labs/terraform-aws-github-runner/commit/cfb6da212e1d481a39427188fc1dd49a18e45cf4))


### Bug Fixes

* Wrong block device mapping ([#2019](https://github.com/philips-labs/terraform-aws-github-runner/issues/2019)) ([185ef20](https://github.com/philips-labs/terraform-aws-github-runner/commit/185ef20301229ffbdc81874cee2c13f296256036))

### [0.40.4](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.40.3...v0.40.4) (2022-05-06)


### Bug Fixes

* Wrong block device mapping ([#2019](https://github.com/philips-labs/terraform-aws-github-runner/issues/2019)) ([c42a467](https://github.com/philips-labs/terraform-aws-github-runner/commit/c42a467164f6ad5ea7e7a0e5d22653b938cdeaf0))

### [0.40.3](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.40.2...v0.40.3) (2022-05-05)


### Bug Fixes

* Volume size is ingored ([#2014](https://github.com/philips-labs/terraform-aws-github-runner/issues/2014)) ([b733248](https://github.com/philips-labs/terraform-aws-github-runner/commit/b7332489f637ad94bcdceef1e0c7c46149f1e6a7)), closes [#1954](https://github.com/philips-labs/terraform-aws-github-runner/issues/1954)

### [0.40.2](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.40.1...v0.40.2) (2022-04-25)


### Bug Fixes

* Outputs for pool need to account for complexity ([#1970](https://github.com/philips-labs/terraform-aws-github-runner/issues/1970)) ([2d92906](https://github.com/philips-labs/terraform-aws-github-runner/commit/2d92906c54675b502d9bee7012f031db9f3e2943))

### [0.40.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.40.0...v0.40.1) (2022-04-25)


### Bug Fixes

* Avoid non semantic commontes can be merged. ([#1969](https://github.com/philips-labs/terraform-aws-github-runner/issues/1969)) ([ad1c872](https://github.com/philips-labs/terraform-aws-github-runner/commit/ad1c872601148d4c32b67735a4c6935c6e5e234f))

## [0.40.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.39.0...v0.40.0) (2022-04-13)


### Features

* Support multi runner process support for runner scale down. ([#1859](https://github.com/philips-labs/terraform-aws-github-runner/issues/1859)) ([3658d6a](https://github.com/philips-labs/terraform-aws-github-runner/commit/3658d6a8a8b119133f66572fa090b720d5132f5a))


### Bug Fixes

* Set the minimal AWS provider to 3.50 ([#1937](https://github.com/philips-labs/terraform-aws-github-runner/issues/1937)) ([16095d8](https://github.com/philips-labs/terraform-aws-github-runner/commit/16095d86b848c26e93a5576302ffba8f43c12c28))

## [0.39.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.38.0...v0.39.0) (2022-03-25)


### Features

* Add possibility to create multiple ebs ([#1845](https://github.com/philips-labs/terraform-aws-github-runner/issues/1845)) ([7a2ca0d](https://github.com/philips-labs/terraform-aws-github-runner/commit/7a2ca0deb0d874a1ff2460f1108f56dde8c683b8))


### Bug Fixes

* Don't delete busy runners ([#1832](https://github.com/philips-labs/terraform-aws-github-runner/issues/1832)) ([0e9b083](https://github.com/philips-labs/terraform-aws-github-runner/commit/0e9b083ec99b228037acca4477e680deb6343bb7))

## [0.38.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.37.0...v0.38.0) (2022-03-21)


### Features

* Add option for ephemeral to check builds status before scaling ([#1854](https://github.com/philips-labs/terraform-aws-github-runner/issues/1854)) ([7eb0bda](https://github.com/philips-labs/terraform-aws-github-runner/commit/7eb0bdad62d77fa418ddf5db16bdddec2cb92875))


### Bug Fixes

* Retention days was used instead of kms key id for pool ([#1855](https://github.com/philips-labs/terraform-aws-github-runner/issues/1855)) ([aa29d93](https://github.com/philips-labs/terraform-aws-github-runner/commit/aa29d9385753e3a578fb681363f022129dc501c2))

## [0.37.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.36.0...v0.37.0) (2022-03-10)


### Features

*  Add associate_public_ip_address variable to windows AMI too ([#1819](https://github.com/philips-labs/terraform-aws-github-runner/issues/1819)) ([0b8e1fc](https://github.com/philips-labs/terraform-aws-github-runner/commit/0b8e1fc6ce0308c925f33ab5b118215259392359)), closes [/github.com/philips-labs/terraform-aws-github-runner/pull/1816#issuecomment-1060650668](https://github.com/philips-labs//github.com/philips-labs/terraform-aws-github-runner/pull/1816/issues/issuecomment-1060650668)
* Add associate_public_ip_address variable ([#1816](https://github.com/philips-labs/terraform-aws-github-runner/issues/1816)) ([052e9f8](https://github.com/philips-labs/terraform-aws-github-runner/commit/052e9f861ea718be9c579aa1d52bc52237aea320))
* Add option for KMS encryption for cloudwatch log groups ([#1833](https://github.com/philips-labs/terraform-aws-github-runner/issues/1833)) ([3f1a67f](https://github.com/philips-labs/terraform-aws-github-runner/commit/3f1a67ff2135880b2fe217bf3403170012c304a2))
* Add SQS queue resource policy to improve security ([#1798](https://github.com/philips-labs/terraform-aws-github-runner/issues/1798)) ([96def9a](https://github.com/philips-labs/terraform-aws-github-runner/commit/96def9a2150e3aa253b9f24884097eef2a84bc99))
* Add Support for Alternative Partitions in ARNs (like govcloud) ([#1815](https://github.com/philips-labs/terraform-aws-github-runner/issues/1815)) ([0ba06c8](https://github.com/philips-labs/terraform-aws-github-runner/commit/0ba06c87cd393db7caa91f603051011de6a13c46))
* Add variable to specify custom commands while building the AMI ([#1838](https://github.com/philips-labs/terraform-aws-github-runner/issues/1838)) ([8f9c342](https://github.com/philips-labs/terraform-aws-github-runner/commit/8f9c34236adc74e4ccb46a06bdd4d946a2bee9a7))


### Bug Fixes

* Autoupdate should be disabled by default ([#1797](https://github.com/philips-labs/terraform-aws-github-runner/issues/1797)) ([828bed6](https://github.com/philips-labs/terraform-aws-github-runner/commit/828bed6f021439e5a1cff690e29b6e322cb4d304))
* Create SQS DLQ policy only if DLQ is created ([#1839](https://github.com/philips-labs/terraform-aws-github-runner/issues/1839)) ([c88a005](https://github.com/philips-labs/terraform-aws-github-runner/commit/c88a0054bb00f64c69a4aef08a6258ab98ee0b9d))
* Upgrade Amazon base AMI to Amazon Linux 2 kernel 5x ([#1812](https://github.com/philips-labs/terraform-aws-github-runner/issues/1812)) ([9aa5532](https://github.com/philips-labs/terraform-aws-github-runner/commit/9aa5532e6e9d7fab7ea2f1e9995e608cf063ca5e))

## [0.36.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.35.0...v0.36.0) (2022-02-25)


### Features

* **runner:** Add option to disable auto update ([#1791](https://github.com/philips-labs/terraform-aws-github-runner/issues/1791)) ([c2a834f](https://github.com/philips-labs/terraform-aws-github-runner/commit/c2a834fa324016a18227327c262203791478b394))

## [0.35.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.34.2...v0.35.0) (2022-02-18)


### Features

* Parameterise delete_on_termination ([#1758](https://github.com/philips-labs/terraform-aws-github-runner/issues/1758)) ([6282351](https://github.com/philips-labs/terraform-aws-github-runner/commit/628235135d4e01dd1a1bde5b8f5a063eff73c05e)), closes [#1745](https://github.com/philips-labs/terraform-aws-github-runner/issues/1745)
* **runner:** Ability to disable default runner security group creation ([#1718](https://github.com/philips-labs/terraform-aws-github-runner/issues/1718)) ([94779f8](https://github.com/philips-labs/terraform-aws-github-runner/commit/94779f8aa217edfebfba57da73a246f7497dc793))

### [0.34.2](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.34.1...v0.34.2) (2022-02-11)


### Bug Fixes

* Limit AWS Terraform Provider to 3.* ([#1741](https://github.com/philips-labs/terraform-aws-github-runner/issues/1741)) ([0cf2b5d](https://github.com/philips-labs/terraform-aws-github-runner/commit/0cf2b5d751600c716aaf2c222ea24721611f16a2))
* **runner:** Cannot disable cloudwatch agent ([#1738](https://github.com/philips-labs/terraform-aws-github-runner/issues/1738)) ([0f798ca](https://github.com/philips-labs/terraform-aws-github-runner/commit/0f798caf923d0be86713b36273c5b53510a57def))

### [0.34.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.34.0...v0.34.1) (2022-02-10)


### Bug Fixes

* **syncer:** Fix for windows binaries in action runner syncer ([#1716](https://github.com/philips-labs/terraform-aws-github-runner/issues/1716)) ([63e0e27](https://github.com/philips-labs/terraform-aws-github-runner/commit/63e0e27d4ed4d93f060153d3eb706ce7b5750bd1))

## [0.34.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.33.0...v0.34.0) (2022-02-05)


### Features

* Add output image id used in launch template ([#1676](https://github.com/philips-labs/terraform-aws-github-runner/issues/1676)) ([a49fab4](https://github.com/philips-labs/terraform-aws-github-runner/commit/a49fab4703dc6eec88d83b457af268a0f802eef5))

## [0.33.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.32.0...v0.33.0) (2022-01-28)


### Features

* **images:** Added ubuntu-focual example packer configuration ([#1644](https://github.com/philips-labs/terraform-aws-github-runner/issues/1644)) ([997b171](https://github.com/philips-labs/terraform-aws-github-runner/commit/997b17174b1c59476d1e7ff5ca8b6a9b1e1b8528))


### Bug Fixes

* **examples:** Update AMI filter ([#1673](https://github.com/philips-labs/terraform-aws-github-runner/issues/1673)) ([39c019c](https://github.com/philips-labs/terraform-aws-github-runner/commit/39c019cb30aca306ba330a8613222f011436faec))

## [0.32.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.31.0...v0.32.0) (2022-01-19)


### Features

* **runner:** Replace patch by install ICU package for ARM runners ([#1624](https://github.com/philips-labs/terraform-aws-github-runner/issues/1624)) ([74cfa51](https://github.com/philips-labs/terraform-aws-github-runner/commit/74cfa511291f6175f3418cf3595b08ac2894ae04))


### Bug Fixes

* **images:** use new runner install location ([#1628](https://github.com/philips-labs/terraform-aws-github-runner/issues/1628)) ([36c1bf5](https://github.com/philips-labs/terraform-aws-github-runner/commit/36c1bf5acda33f6e1498cf380a669df976fb12c6))
* **packer:** Add missing RUNNER_ARCHITECTURE for amazn-linux2 ([#1647](https://github.com/philips-labs/terraform-aws-github-runner/issues/1647)) ([ec497a2](https://github.com/philips-labs/terraform-aws-github-runner/commit/ec497a2576abb086e67f75e4358fd107e57212db))

## [0.31.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.30.1...v0.31.0) (2022-01-14)


### Features

* **packer:** add vars and minor clean up ([#1611](https://github.com/philips-labs/terraform-aws-github-runner/issues/1611)) ([1c897a4](https://github.com/philips-labs/terraform-aws-github-runner/commit/1c897a457bc4a4a53d68e90acb29cb04d1e7e0cc))


### Bug Fixes

* **webhook:** depcrated warning on ts-jest mocked ([#1615](https://github.com/philips-labs/terraform-aws-github-runner/issues/1615)) ([56c1ece](https://github.com/philips-labs/terraform-aws-github-runner/commit/56c1ece7e02ab5b2ad0a04460412b95933092b1f))

### [0.30.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.30.0...v0.30.1) (2022-01-13)


### Bug Fixes

* **runnrs:** Pool runners to allow multiple pool_config objects ([#1621](https://github.com/philips-labs/terraform-aws-github-runner/issues/1621)) ([c9c7c69](https://github.com/philips-labs/terraform-aws-github-runner/commit/c9c7c6991b59c6f70e4a8005c042bd98b8a71840))

## [0.30.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.29.0...v0.30.0) (2022-01-12)


### Features

* Add scheduled / pull based scaling for org level runners ([#1577](https://github.com/philips-labs/terraform-aws-github-runner/issues/1577)) ([8197432](https://github.com/philips-labs/terraform-aws-github-runner/commit/8197432a21011ecc6a8519862be8872b3b5d6113))

## [0.29.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.28.0...v0.29.0) (2022-01-11)


### Features

* Strict label check and replace disable_check_wokflow_job_labels by opt in enable_workflow_job_labels_check ([#1591](https://github.com/philips-labs/terraform-aws-github-runner/issues/1591)) ([405b11d](https://github.com/philips-labs/terraform-aws-github-runner/commit/405b11db828234bfb1eb8482493a25505ce59a34))

## [0.28.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.27.2...v0.28.0) (2022-01-06)


### Features

* add option ephemeral runners ([#1374](https://github.com/philips-labs/terraform-aws-github-runner/issues/1374)) ([2f323d6](https://github.com/philips-labs/terraform-aws-github-runner/commit/2f323d642c28d42b36705d2768715302f301ea33)), closes [#1399](https://github.com/philips-labs/terraform-aws-github-runner/issues/1399) [#1444](https://github.com/philips-labs/terraform-aws-github-runner/issues/1444)
* Change default location of runner to `/opt` and fix Ubuntu example ([#1572](https://github.com/philips-labs/terraform-aws-github-runner/issues/1572)) ([77f350b](https://github.com/philips-labs/terraform-aws-github-runner/commit/77f350b0be40ad953c51057b7ab1a23b68ee9862))
* Replace run instance API by create fleet API ([#1556](https://github.com/philips-labs/terraform-aws-github-runner/issues/1556)) ([27e974d](https://github.com/philips-labs/terraform-aws-github-runner/commit/27e974da12e5c009732b5dd6adc0b7a7711fba14))
* Support t4g Graviton instance type ([#1561](https://github.com/philips-labs/terraform-aws-github-runner/issues/1561)) ([3fa5896](https://github.com/philips-labs/terraform-aws-github-runner/commit/3fa5896301e1b3042e7d06babab636daa453d339))


### Bug Fixes

* Add config for windows ami ([#1525](https://github.com/philips-labs/terraform-aws-github-runner/issues/1525)) ([7907984](https://github.com/philips-labs/terraform-aws-github-runner/commit/790798402be060fe5c3b190c00782eeca8456c11))

### [0.27.2](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.27.1...v0.27.2) (2021-12-22)


### Bug Fixes

* Dowload lambda see [#1541](https://github.com/philips-labs/terraform-aws-github-runner/issues/1541) for details. ([#1542](https://github.com/philips-labs/terraform-aws-github-runner/issues/1542)) ([7cb73c8](https://github.com/philips-labs/terraform-aws-github-runner/commit/7cb73c8a5165564244a4d6ec842238de7a4b913b))

### [0.27.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.27.0...v0.27.1) (2021-12-21)


### Bug Fixes

* add --preserve-env to start-runner.sh to enable RUNNER_ALLOW_RUNASROOT ([#1537](https://github.com/philips-labs/terraform-aws-github-runner/issues/1537)) ([1cd9cd3](https://github.com/philips-labs/terraform-aws-github-runner/commit/1cd9cd394893206bc96fb72cfdbe5b3c5c288530))
* remove export from install script. ([#1538](https://github.com/philips-labs/terraform-aws-github-runner/issues/1538)) ([d32ca1b](https://github.com/philips-labs/terraform-aws-github-runner/commit/d32ca1b74be88196eacc51a186bc5e2a505dcf0c))

## [0.27.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.26.1...v0.27.0) (2021-12-16)


### Features

* add windows support ([#1476](https://github.com/philips-labs/terraform-aws-github-runner/issues/1476)) ([dbba705](https://github.com/philips-labs/terraform-aws-github-runner/commit/dbba705038828c86f6f5adef18f7a7a35643c359))

### [0.26.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.26.0...v0.26.1) (2021-12-08)


### Bug Fixes

* Download lambda ([#1480](https://github.com/philips-labs/terraform-aws-github-runner/issues/1480)) ([f1b99d9](https://github.com/philips-labs/terraform-aws-github-runner/commit/f1b99d98ba86a4dd35e23e04a90dc11fb233beb7))
* **syncer:** Add tests, coverage report, and refactor lambda / naming ([#1478](https://github.com/philips-labs/terraform-aws-github-runner/issues/1478)) ([8266442](https://github.com/philips-labs/terraform-aws-github-runner/commit/8266442176025095a8eec8c4c042d4783301575e))
* install_config_runner -> install_runner ([#1479](https://github.com/philips-labs/terraform-aws-github-runner/issues/1479)) ([de5b93f](https://github.com/philips-labs/terraform-aws-github-runner/commit/de5b93fe96d08595490f78ca84b354c9d6532ffa))

## [0.26.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.25.2...v0.26.0) (2021-12-03)


### Features

* Add hooks for prebuilt images (AMI), including amazon linux packer example ([#1444](https://github.com/philips-labs/terraform-aws-github-runner/issues/1444)) ([060daac](https://github.com/philips-labs/terraform-aws-github-runner/commit/060daac3568cd36f8b203d3f77f736df7aefb223))


### Bug Fixes

* add runners binaries bucket as terraform output ([5809fee](https://github.com/philips-labs/terraform-aws-github-runner/commit/5809fee194bcf7a8a1291efbb63df441b31779bb))

### [0.25.2](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.25.1...v0.25.2) (2021-12-01)


### Bug Fixes

* add logging context to runner lambda ([#1399](https://github.com/philips-labs/terraform-aws-github-runner/issues/1399)) ([0ba0930](https://github.com/philips-labs/terraform-aws-github-runner/commit/0ba09303072e58f12abd93ddd1599573d7ffafb0))
* **logging:** Add context to webhook logs ([#1401](https://github.com/philips-labs/terraform-aws-github-runner/issues/1401)) ([8094576](https://github.com/philips-labs/terraform-aws-github-runner/commit/80945761f997498d5f6ff2755db4eb506e7d5890))

### [0.25.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.25.0...v0.25.1) (2021-11-18)


### Bug Fixes

* Add required providers to module ssm ([#1423](https://github.com/philips-labs/terraform-aws-github-runner/issues/1423)) ([5b68b7b](https://github.com/philips-labs/terraform-aws-github-runner/commit/5b68b7b8bfc5308353e6ff69e129b356779d0be5))

## [0.25.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.24.0...v0.25.0) (2021-11-18)


### Features

* Add option to configure concurrent running scale up lambda ([#1415](https://github.com/philips-labs/terraform-aws-github-runner/issues/1415)) ([23ee630](https://github.com/philips-labs/terraform-aws-github-runner/commit/23ee6303d58640cb02fe7d71e71fc7960e30f48a))


### Bug Fixes

* clean up non used variables in examples ([#1416](https://github.com/philips-labs/terraform-aws-github-runner/issues/1416)) ([fe65a5f](https://github.com/philips-labs/terraform-aws-github-runner/commit/fe65a5f05184b6b5534c3b0b5fee3cdfbce7be78))

## [0.24.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.23.1...v0.24.0) (2021-11-09)


### Features

* support single line for app private key ([#1368](https://github.com/philips-labs/terraform-aws-github-runner/issues/1368)) ([14183ac](https://github.com/philips-labs/terraform-aws-github-runner/commit/14183aca4fe097350de165030e227d8dd0cb6630))


### Bug Fixes

* update return codes, no error code for job that are ignored ([#1381](https://github.com/philips-labs/terraform-aws-github-runner/issues/1381)) ([f9f705f](https://github.com/philips-labs/terraform-aws-github-runner/commit/f9f705f4a736be8d50727970e216830780142d27))

### [0.23.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.23.0...v0.23.1) (2021-11-04)


### Bug Fixes

* configurable metadata options for runners ([#1377](https://github.com/philips-labs/terraform-aws-github-runner/issues/1377)) ([f37df23](https://github.com/philips-labs/terraform-aws-github-runner/commit/f37df239a991b0d5ad6a2972ef3c9759b03b9f6f))

## [0.23.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.22.0...v0.23.0) (2021-11-04)


### Features

* add option to format logging in JSON for lambdas ([#1228](https://github.com/philips-labs/terraform-aws-github-runner/issues/1228)) ([a250b96](https://github.com/philips-labs/terraform-aws-github-runner/commit/a250b96b58c91e35ad64e3cbd8c00c3aa4475900))
* add option to specify SSE config for dist bucket ([#1324](https://github.com/philips-labs/terraform-aws-github-runner/issues/1324)) ([ae84302](https://github.com/philips-labs/terraform-aws-github-runner/commit/ae84302b284f9a076418b27426330913cf909822))


### Bug Fixes

* reducing verbosity of role and profile ([#1358](https://github.com/philips-labs/terraform-aws-github-runner/issues/1358)) ([922ef99](https://github.com/philips-labs/terraform-aws-github-runner/commit/922ef99be52f8d780ec711f33e1f6c447dbedffd))

## [0.22.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.21.1...v0.22.0) (2021-11-01)


### Features

* adding message retention seconds ([#1354](https://github.com/philips-labs/terraform-aws-github-runner/issues/1354)) ([a19929f](https://github.com/philips-labs/terraform-aws-github-runner/commit/a19929f8467c448dfb893b5aa4565c6e53a5ef2f))
* adding var for tags for ec2s ([#1357](https://github.com/philips-labs/terraform-aws-github-runner/issues/1357)) ([31cf02d](https://github.com/philips-labs/terraform-aws-github-runner/commit/31cf02d831114e687ff3f614c768b9374f49045c))


### Bug Fixes

* add validation to distribution_bucket_name variable ([#1356](https://github.com/philips-labs/terraform-aws-github-runner/issues/1356)) ([6522317](https://github.com/philips-labs/terraform-aws-github-runner/commit/6522317c5097ee49aee3c1c8926f72c6bd054e51))

### [0.21.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.21.0...v0.21.1) (2021-10-21)


### Bug Fixes

* **logging:** Adjusting scale logging messages and levels ([#1286](https://github.com/philips-labs/terraform-aws-github-runner/issues/1286)) ([665e1a6](https://github.com/philips-labs/terraform-aws-github-runner/commit/665e1a6aa30610584b863c99bb5dc4509c0f11df))
* **logging:** Adjusting webhook logs and levels ([#1287](https://github.com/philips-labs/terraform-aws-github-runner/issues/1287)) ([9df5fb8](https://github.com/philips-labs/terraform-aws-github-runner/commit/9df5fb88fee5b8a9428afe90ce13a0680d50471f))
* Update launch template to use metadata service v2 ([#1278](https://github.com/philips-labs/terraform-aws-github-runner/issues/1278)) ([ef16287](https://github.com/philips-labs/terraform-aws-github-runner/commit/ef1628747ec0305311a32f623dc7de64692eec40))

## [0.21.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.20.1...v0.21.0) (2021-10-11)


### Features

* Ignore github managed labels and add check disable option ([#1244](https://github.com/philips-labs/terraform-aws-github-runner/issues/1244)) ([859fa38](https://github.com/philips-labs/terraform-aws-github-runner/commit/859fa381570ec9ab1de586f7b3ccb6bc51b47b27))
* remove unused app client since SSH key is used to secure app authorization ([#1223](https://github.com/philips-labs/terraform-aws-github-runner/issues/1223)) ([4cb5cf1](https://github.com/philips-labs/terraform-aws-github-runner/commit/4cb5cf17c37fd22b540c93c61a7c15b42d4e42e1))
* upgrade Terraform version of module 1.0.x ([#1254](https://github.com/philips-labs/terraform-aws-github-runner/issues/1254)) ([2a817dc](https://github.com/philips-labs/terraform-aws-github-runner/commit/2a817dcaf96c189ab05e3f629bf3e17a539728d6))

### [0.20.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.20.0...v0.20.1) (2021-10-07)


### Bug Fixes

* Upgrade lambda runtime to node 14.x ([#1203](https://github.com/philips-labs/terraform-aws-github-runner/issues/1203)) ([570949a](https://github.com/philips-labs/terraform-aws-github-runner/commit/570949a55a1b2f702e1d58c74533ddc86174ef8d))
* **webhook:** remove node fetch ([ca14ac5](https://github.com/philips-labs/terraform-aws-github-runner/commit/ca14ac51b4f824b76fa50ac4608e935702fde628))
* **webhook:** replace node-fetch by axios [#1247](https://github.com/philips-labs/terraform-aws-github-runner/issues/1247) ([80fff4b](https://github.com/philips-labs/terraform-aws-github-runner/commit/80fff4b8e2902d0347acc53d56843da507c60330))
* added more detailed logging for scaling up and down ([#1222](https://github.com/philips-labs/terraform-aws-github-runner/issues/1222)) ([9aa7456](https://github.com/philips-labs/terraform-aws-github-runner/commit/9aa7456bb16bc3e75e71eb67cd098cd49b305094))

## [0.20.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.19.1...v0.20.0) (2021-10-01)


### Features

* Add option to disable SSL verification support for GitHub Enterprise Server ([#1216](https://github.com/philips-labs/terraform-aws-github-runner/issues/1216)) ([3c3ef19](https://github.com/philips-labs/terraform-aws-github-runner/commit/3c3ef19b176811d96f3fa821aadb10576847fb72)), closes [#1207](https://github.com/philips-labs/terraform-aws-github-runner/issues/1207)

### [0.19.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.19.0...v0.19.1) (2021-09-30)


### Bug Fixes

* `instance_types` from a Set to a List, so instance order preference is preserved ([#1154](https://github.com/philips-labs/terraform-aws-github-runner/issues/1154)) ([150d227](https://github.com/philips-labs/terraform-aws-github-runner/commit/150d227c99d517366b9304663a6fdc55b0bb8475))

## [0.19.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.18.1...v0.19.0) (2021-09-30)


### Features

* **scale-down:** Update Owner Logic ([#1065](https://github.com/philips-labs/terraform-aws-github-runner/issues/1065)) ([ba2536b](https://github.com/philips-labs/terraform-aws-github-runner/commit/ba2536bbf7bc7a98180b25d8703ef6edc25bc2b7)), closes [#2](https://github.com/philips-labs/terraform-aws-github-runner/issues/2)


### Bug Fixes

* explicit set region for downloading runner distribution from S3 ([#1204](https://github.com/philips-labs/terraform-aws-github-runner/issues/1204)) ([439fb1b](https://github.com/philips-labs/terraform-aws-github-runner/commit/439fb1bb5b0b7b024476b41ac57436af1aa30dae))
* upgrade jest  ([#1219](https://github.com/philips-labs/terraform-aws-github-runner/issues/1219)) ([c8b8139](https://github.com/philips-labs/terraform-aws-github-runner/commit/c8b813948c973fd9157ae19f7ed3a04781d2211a))
* use dynamic block to ignore null market opts ([#1202](https://github.com/philips-labs/terraform-aws-github-runner/issues/1202)) ([df9bd78](https://github.com/philips-labs/terraform-aws-github-runner/commit/df9bd785619c9ce8ca2eef1d9b9631271eaa9763))
* use dynamic block to ignore null market opts ([#1202](https://github.com/philips-labs/terraform-aws-github-runner/issues/1202)) ([06a5598](https://github.com/philips-labs/terraform-aws-github-runner/commit/06a5598210e98f036593f97f74488aae1cf179da))
* **logging:** Additional Logging ([#1135](https://github.com/philips-labs/terraform-aws-github-runner/issues/1135)) ([f7f194d](https://github.com/philips-labs/terraform-aws-github-runner/commit/f7f194d00090013ec28215f1939ddff5823be7ff))
* **scale-down:** Clearing cache between runs ([#1164](https://github.com/philips-labs/terraform-aws-github-runner/issues/1164)) ([e72227b](https://github.com/philips-labs/terraform-aws-github-runner/commit/e72227bd8c5d76f14c42119e17eae5762c247f85))

### [0.18.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.18.0...v0.18.1) (2021-08-26)


### Bug Fixes

* webhook labels for `workflow_job` ([#1133](https://github.com/philips-labs/terraform-aws-github-runner/issues/1133)) ([4b39fb9](https://github.com/philips-labs/terraform-aws-github-runner/commit/4b39fb9db523ad7b7ec47adf6c698323d17faed3))

## [0.18.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.17.0...v0.18.0) (2021-08-19)


### Features

* add format checking for lambdas in CI ([#899](https://github.com/philips-labs/terraform-aws-github-runner/issues/899)) ([#1080](https://github.com/philips-labs/terraform-aws-github-runner/issues/1080)) ([ae9c277](https://github.com/philips-labs/terraform-aws-github-runner/commit/ae9c2777ee27c7d984feff12c6d58edd1ef26c74))
* add option to overwrite / disable egress [#748](https://github.com/philips-labs/terraform-aws-github-runner/issues/748) ([#1112](https://github.com/philips-labs/terraform-aws-github-runner/issues/1112)) ([9c2548d](https://github.com/philips-labs/terraform-aws-github-runner/commit/9c2548d3380252efbb402fe15dcacf28f883a56d))


### Bug Fixes

* replace depcrated 'request' dependency by 'node-fetch' ([#903](https://github.com/philips-labs/terraform-aws-github-runner/issues/903)) ([#1082](https://github.com/philips-labs/terraform-aws-github-runner/issues/1082)) ([fb51756](https://github.com/philips-labs/terraform-aws-github-runner/commit/fb51756730ac902ff0148b362464922aea9f6d6d))

## [0.17.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.16.0...v0.17.0) (2021-08-06)


### Features

* Adding support for new workflow_job event. ([#1019](https://github.com/philips-labs/terraform-aws-github-runner/issues/1019)) ([a74e10b](https://github.com/philips-labs/terraform-aws-github-runner/commit/a74e10b625413e948703f5d3a6f61b9a98c31b66))

## [0.16.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.15.1...v0.16.0) (2021-08-05)


### Features

* make delay of webhook event configurable ([#990](https://github.com/philips-labs/terraform-aws-github-runner/issues/990)) ([92a0d8a](https://github.com/philips-labs/terraform-aws-github-runner/commit/92a0d8a94b145c3e2fdcfa120907c17228583d93))
* Store lambda secrets paramaters in Paramater Store ([#941](https://github.com/philips-labs/terraform-aws-github-runner/issues/941)) ([c6badbf](https://github.com/philips-labs/terraform-aws-github-runner/commit/c6badbf9e1cf6bbcdd6a9841b1f342ef5fbd1ed3)), closes [#871](https://github.com/philips-labs/terraform-aws-github-runner/issues/871) [#898](https://github.com/philips-labs/terraform-aws-github-runner/issues/898) [#738](https://github.com/philips-labs/terraform-aws-github-runner/issues/738) [#902](https://github.com/philips-labs/terraform-aws-github-runner/issues/902) [#738](https://github.com/philips-labs/terraform-aws-github-runner/issues/738) [#905](https://github.com/philips-labs/terraform-aws-github-runner/issues/905) [#906](https://github.com/philips-labs/terraform-aws-github-runner/issues/906) [#904](https://github.com/philips-labs/terraform-aws-github-runner/issues/904) [#1](https://github.com/philips-labs/terraform-aws-github-runner/issues/1) [#752](https://github.com/philips-labs/terraform-aws-github-runner/issues/752) [#909](https://github.com/philips-labs/terraform-aws-github-runner/issues/909) [#752](https://github.com/philips-labs/terraform-aws-github-runner/issues/752) [#908](https://github.com/philips-labs/terraform-aws-github-runner/issues/908) [#752](https://github.com/philips-labs/terraform-aws-github-runner/issues/752) [#887](https://github.com/philips-labs/terraform-aws-github-runner/issues/887) [#752](https://github.com/philips-labs/terraform-aws-github-runner/issues/752) [#885](https://github.com/philips-labs/terraform-aws-github-runner/issues/885) [#752](https://github.com/philips-labs/terraform-aws-github-runner/issues/752) [#889](https://github.com/philips-labs/terraform-aws-github-runner/issues/889) [#752](https://github.com/philips-labs/terraform-aws-github-runner/issues/752) [#892](https://github.com/philips-labs/terraform-aws-github-runner/issues/892) [#752](https://github.com/philips-labs/terraform-aws-github-runner/issues/752) [#907](https://github.com/philips-labs/terraform-aws-github-runner/issues/907) [#752](https://github.com/philips-labs/terraform-aws-github-runner/issues/752) [#864](https://github.com/philips-labs/terraform-aws-github-runner/issues/864) [#918](https://github.com/philips-labs/terraform-aws-github-runner/issues/918)


### Bug Fixes

* change module exports and upgrade vercel to latest release ([#1005](https://github.com/philips-labs/terraform-aws-github-runner/issues/1005)) ([f8f8981](https://github.com/philips-labs/terraform-aws-github-runner/commit/f8f8981332929619402aad161ce2a1feb61842ce))
* reduce permission required for session manager ([#1018](https://github.com/philips-labs/terraform-aws-github-runner/issues/1018)) ([09476eb](https://github.com/philips-labs/terraform-aws-github-runner/commit/09476eb609699d8b5eb4e1e438e13c5bfa234084))

### [0.15.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.15.0...v0.15.1) (2021-07-13)


### Bug Fixes

* apply patch for broken scale up lambda [#980](https://github.com/philips-labs/terraform-aws-github-runner/issues/980) ([b957e26](https://github.com/philips-labs/terraform-aws-github-runner/commit/b957e263b6dbc3d299eab3236b479b9113b1fecb))

## [0.15.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.14.0...v0.15.0) (2021-07-07)


### Features

* Added support for white listing of repositories ([#915](https://github.com/philips-labs/terraform-aws-github-runner/issues/915)) ([b1f451a](https://github.com/philips-labs/terraform-aws-github-runner/commit/b1f451a0bddf8606b443c5150e939e7628645ccf))

## [0.14.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.13.1...v0.14.0) (2021-06-17)


### Features

* support multiple instance types ([#898](https://github.com/philips-labs/terraform-aws-github-runner/issues/898)) ([c996f73](https://github.com/philips-labs/terraform-aws-github-runner/commit/c996f731efbfd4c3bdda4195fba48e346812e108))


### Bug Fixes

* scale down runners ([#905](https://github.com/philips-labs/terraform-aws-github-runner/issues/905)) ([f024cda](https://github.com/philips-labs/terraform-aws-github-runner/commit/f024cda9b08fb3ab39d2cca0cafe61512af38f0d))
* **scale:** Refactor Runner Type and Owner ([#871](https://github.com/philips-labs/terraform-aws-github-runner/issues/871)) ([83dd263](https://github.com/philips-labs/terraform-aws-github-runner/commit/83dd263c3b01566fd7f980ffde34e0fd2dc25e81))

### [0.13.1](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.13.0...v0.13.1) (2021-06-01)


### Bug Fixes

* .gitignore for 'secrets.auto.tfvars' ([38d7df0](https://github.com/philips-labs/terraform-aws-github-runner/commit/38d7df0f86581ea3a1f64b2673707cd0427eb8e3))
* Add some essential dependecies on ubuntu example ([0079d16](https://github.com/philips-labs/terraform-aws-github-runner/commit/0079d16b809fbb7391353e97bce429e295973dd5))
* fail to download wrong tag of lambda ([#840](https://github.com/philips-labs/terraform-aws-github-runner/issues/840)) ([1112ca8](https://github.com/philips-labs/terraform-aws-github-runner/commit/1112ca8bb2da87cfe93fea17a8070fac8bd3598b))
* increase runner sync lambda memory setting and upgrade npm dependencies ([#844](https://github.com/philips-labs/terraform-aws-github-runner/issues/844)) ([b9e36e9](https://github.com/philips-labs/terraform-aws-github-runner/commit/b9e36e9393c932b71817adefba411e420ba3aa65))
* revert dependency updates on runner module ([#784](https://github.com/philips-labs/terraform-aws-github-runner/issues/784)) ([76cdbe3](https://github.com/philips-labs/terraform-aws-github-runner/commit/76cdbe3605269ca64e532b1f850de727ad85658f))
* ubuntu example runner_log_files variable ([5b3fc5b](https://github.com/philips-labs/terraform-aws-github-runner/commit/5b3fc5b59242224ef3662c0bbf61f3346d880c5e))
* ubuntu example to log syslog instead of messages ([#785](https://github.com/philips-labs/terraform-aws-github-runner/issues/785)) ([fb3e5d2](https://github.com/philips-labs/terraform-aws-github-runner/commit/fb3e5d28a018e55bb0cef1697173c8aa70bf8a42))
* Update ubuntu example with assume_role comment ([2478daf](https://github.com/philips-labs/terraform-aws-github-runner/commit/2478daf7efb41da343a157b4001801704d25a648))
* upgrade runner module to support upgrade octokit auth-app ([#786](https://github.com/philips-labs/terraform-aws-github-runner/issues/786)) ([e110318](https://github.com/philips-labs/terraform-aws-github-runner/commit/e110318d5c06d073f6af0d410c06d6d48eed0724))
* **docs:** fix variable name create_service_linked_role_spot in readme ([#750](https://github.com/philips-labs/terraform-aws-github-runner/issues/750)) ([42b0427](https://github.com/philips-labs/terraform-aws-github-runner/commit/42b0427dd0bc25251a160033a3f1d78f6f386d5d)), closes [#736](https://github.com/philips-labs/terraform-aws-github-runner/issues/736)

## [0.13.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.12.0...v0.13.0) (2021-03-28)


### Features

* Allow setting the market_options runners module to disable spot instances ([#657](https://github.com/philips-labs/terraform-aws-github-runner/issues/657)) ([7487643](https://github.com/philips-labs/terraform-aws-github-runner/commit/74876432f6d59325567d470c5637e2b99abefea8))

## [0.12.0](https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.11.0...v0.12.0) (2021-03-09)


### Features

* **syncer:** account access control for distribution cache bucket ([#585](https://github.com/philips-labs/terraform-aws-github-runner/issues/585)) ([05c1c11](https://github.com/philips-labs/terraform-aws-github-runner/commit/05c1c11a6797a650814cea29871f5b5e40d6245a))


### Bug Fixes

* Pass runner_group_name to runner module ([#603](https://github.com/philips-labs/terraform-aws-github-runner/issues/603)) ([54070b3](https://github.com/philips-labs/terraform-aws-github-runner/commit/54070b3feec2602c9017112c98f0a669ea5f06cd))

## [0.11.0] - 2021-03-01

### Added

- feat: Tag Volume Resources (#570)
- feat: Retrieve installation id automatically if not present (triggered by ordinary webhook) (#515)

### Fixed

- fix(bucket): Adds bucket policy #536
- fix: Upgrade vpc to 2.2.0 and pre-commit terraform hooks (#538)
- fix(lint): Clean up lint (#534)

## [0.10.0] - 2021-01-27

### Added

- Support runner groups (#496)

## [0.9.1] - 2021-01-22

### Fixed

- fix(ghes): Corrects preview option #482 @mcaulifn @samuelb

## [0.9.0] - 2021-01-21

### Added

- Add support for GitHub Enterprise Server (GHES) #412, #481, #467 @mcaulifn @jonico
- Allow configuring additional security groups #392 @surminus

### Changed

- Log groups per type of logging #476
- Copy directory *after* installing zip #444 @masterful
- Update ubuntu example with rootless docker and non privileged user #433
- Changed strategy in scaling. Previous the module scaled by checking for any queued workflow for the repo initiation the check_run event. Now the module scales only if the correlated check_run is still in queued state. #423

### Fixed

- Fix missing permissions for CloudWatch Agent #445 @bennettp123
- Swap scale up/scale down timeout description #468 @jonico
- Fix for invalid configuration #466 @jonico
- Add ssm:GetParameter to runner-ssm-parameters #446 @bennettp123
- Replace crypto #429
- Scale up lambda deprecated attribute #410

### Migrations

Changes related to logging groups introduced via #476 will destroy existing logging group in AWS cloudwatch for runners log. In case you would like to keep the logging ensure you remove the log group from the state before running an apply

```bash
export RESOURCE=$(terraform state list | grep "aws_cloudwatch_log_group.runner")
terraform state rm $RESOURCE
```

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

[unreleased]: https://github.com/philips-labs/terraform-aws-github-runner/compare/v0.11.0..HEAD
[0.11.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.10.0..v00.11.0
[0.10.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.9.1..v00.10.0
[0.9.1]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.9.0..v0.9.1
[0.9.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.8.1..v0.9.0
[0.8.1]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.9.0..v0.8.1
[0.8.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.7.0..v0.9.0
[0.7.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.6.0..v0.7.0
[0.6.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.5.0..v0.6.0
[0.5.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.4.0..v0.5.0
[0.4.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.3.0..v0.4.0
[0.3.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.2.0..v0.3.0
[0.2.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.1.0..v0.2.0
[0.1.0]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.0.1..v0.1.0
[0.0.1]: https://github.com/philips-labs/terraform-aws-github-runner/releases/tag/v0.0.1
