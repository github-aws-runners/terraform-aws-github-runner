# Changelog

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
