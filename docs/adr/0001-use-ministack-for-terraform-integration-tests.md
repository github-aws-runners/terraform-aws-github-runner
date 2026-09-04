# ADR 0001: Use MiniStack for Terraform integration tests

- Status: Accepted
- Date: 2026-09-04

## Context

The repository contains Terraform examples that create and connect several AWS
services. Static validation and unit tests do not exercise the provider calls,
resource lifecycle, or interactions between services. We therefore need a
local AWS emulator for integration tests in CI and during development.

The test provider must be free to run in CI, compatible with the AWS Terraform
provider, and sufficiently compatible with the AWS APIs used by the examples.
This decision was developed while implementing [PR #5293](https://github.com/github-aws-runners/terraform-aws-github-runner/pull/5293)
and discussing [MiniStack issue #1611](https://github.com/ministackorg/ministack/issues/1611#issuecomment-5537737162).

We considered three mature local AWS emulators:

| Provider | Relevant advantages | Trade-offs for this repository |
| --- | --- | --- |
| [LocalStack](https://localstack.cloud/) | Established ecosystem, broad AWS service coverage, and Terraform/SDK integrations. A free tier is available, with additional paid tiers and authenticated AWS features. | The current licensing and authentication model adds account/token and tier considerations to open-source CI. The exact capability needed by the examples must also be verified for the selected edition. |
| [Floci](https://github.com/floci-io/floci) | MIT-licensed, free, and designed for local development and CI. Its documentation advertises a broad AWS service matrix and a single AWS-compatible endpoint. | Its service coverage and compatibility are evolving. The repository would need to validate the APIs and Terraform behavior it consumes before adopting it. |
| [MiniStack](https://github.com/ministackorg/ministack) | MIT-licensed and free, supports Terraform and multi-account/multi-region emulation, and provides the AWS services required by the current examples when using v1.5.7+. | It is still an emulator, so unsupported or subtly different AWS behavior can remain. The version must be pinned and upgraded deliberately. |

The number of services advertised by each provider is not a stable selection
criterion: service catalogs and compatibility change frequently. The decision
is based on the behavior required by this repository, the ability to run the
same tests without paid credentials, and the current operational fit.

## Decision

Use MiniStack v1.5.7 or later as the default local AWS emulator for Terraform
integration tests.

The integration-test harness must:

1. Pin the MiniStack image to a known version or digest and upgrade it as an
   explicit test-provider change.
2. Configure the AWS Terraform provider to use MiniStack endpoints and
   test-only credentials so tests cannot accidentally reach AWS.
3. Seed service-specific fixtures, such as AMIs and SSM parameters, in the
   test harness or MiniStack initialization rather than changing production
   examples solely to accommodate the emulator.
4. Run each isolated example against clean emulator state to prevent resource
   names and state from leaking between tests.
5. Treat successful MiniStack tests as local integration evidence, not as a
   substitute for tests against real AWS behavior.

## Provider replacement boundary

The examples and reusable Terraform modules must not depend on MiniStack-only
resources or APIs. Provider-specific behavior belongs in the integration-test
harness, including endpoint configuration, credentials, initialization
fixtures, reset behavior, and cleanup.

If MiniStack no longer satisfies the required AWS behavior, the harness may be
adapted to LocalStack, Floci, or another compatible emulator. A replacement
must pass the same example and API contract tests before it becomes the
default. This keeps the provider choice replaceable without changing the
production module interface.

## Consequences

### Positive

- CI and local integration tests can run without an AWS account or paid
  emulator subscription.
- The selected version supports the AWS API behavior needed by the examples.
- Test-only fixture setup keeps production examples representative of real AWS
  usage.
- The provider replacement boundary limits future migration work to the test
  harness and its fixtures.

### Negative

- MiniStack behavior can differ from AWS and must not be treated as complete
  AWS certification.
- Pinning the emulator requires deliberate maintenance when the AWS provider,
  examples, or MiniStack API behavior changes.

## References

- [MiniStack v1.5.7 release notes](https://github.com/ministackorg/ministack/releases/tag/v1.5.7)
- [MiniStack issue #1611](https://github.com/ministackorg/ministack/issues/1611#issuecomment-5537737162)
- [Terraform integration test PR #5293](https://github.com/github-aws-runners/terraform-aws-github-runner/pull/5293#issuecomment-5537774649)
- [MiniStack service and Terraform documentation](https://github.com/ministackorg/ministack)
- [Floci service matrix](https://floci.io/floci/services/)
- [LocalStack pricing comparison](https://www.localstack.cloud/pricing-comparison)
