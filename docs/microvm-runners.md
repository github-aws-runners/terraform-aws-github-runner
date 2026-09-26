# Lambda MicroVM Runners (Experimental)

!!! warning
    Lambda MicroVM runner support is experimental. The image build, lifecycle-hook server, control-plane integration, and AWS MicroVM APIs must be configured together. Validate the complete flow in a non-production environment before relying on it for workloads.

## Overview

Lambda MicroVM runners provide ephemeral GitHub Actions runners backed by
Lambda MicroVMs. The runner control plane receives demand, obtains the
one-time runner configuration, starts a MicroVM from a published image, and
passes the runtime execution role to the MicroVM.

The repository includes a combined [multi-runner orchestration example](examples/multi-runner-orchestration.md)
that places EC2 and Lambda MicroVM lanes behind one webhook endpoint. The
provider-specific lifecycle checks are shared where possible, so the same
deployment can validate both providers.

## Prerequisites

Before deploying the MicroVM runner lane, prepare all of the following in the
target AWS Region:

1. **MicroVM foundation.** Apply the
   [MicroVM foundation example](examples/microvm-foundation.md). It creates the
   regional artifact bucket, Lambda Network Connectors, the image-build role,
   and the reusable MicroVM usage policy.
2. **Lifecycle-hook artifact.** Build and release
   `lambdas/services/microvm-lifecycle-hooks` through the same workspace
   artifact process used for the repository's Lambda services. The resulting
   ZIP is embedded in the MicroVM image.
3. **Published MicroVM image.** Use the
   [MicroVM Ubuntu image instructions](https://github.com/github-aws-runners/terraform-aws-github-runner/blob/main/images/microvm-ubuntu/README.md)
   to build and publish an image with Packer. The image must contain the
   compatible lifecycle-hook server and runner entrypoint.
4. **Runner execution role.** Configure the runner role through the runner
   configuration. This is different from the foundation's build role. The
   control-plane TypeScript passes the execution role to `RunMicrovm`, so the
   Lambda that starts the MicroVM must have permission to pass it.
5. **Runner control plane and artifacts.** Deploy the runner control plane with
   the published image ARN/version, Network Connector ARNs, GitHub App
   configuration, and the runner-control and webhook Lambda ZIPs.

The foundation does not create the image or the runner execution role. The
image build does not choose the runtime role. These are separate dependencies
owned by the image build and runner-control-plane stages respectively.

## IAM roles

MicroVM deployments use two roles for two different operations:

| Role | Used by | Responsibility |
| --- | --- | --- |
| Build role (`build_role_arn`) | Packer/image publisher | Creates and publishes the MicroVM image and accesses the foundation build artifacts. |
| Execution role | Runner control plane and the MicroVM | Is passed to `RunMicrovm` and provides the permissions used by the ephemeral runner at runtime. |

Do not use the build role as the runner execution role. The control-plane
Lambda needs `iam:PassRole` for the configured execution role, and the
execution role must contain the runtime permissions required by the selected
runner lane.

## Deployment order

The complete dependency chain is:

```text
MicroVM foundation
        |
        v
Build/release lifecycle-hook server
        |
        v
Packer builds and publishes image
        |
        v
Runner control plane resolves execution role
        |
        v
RunMicrovm starts an ephemeral runner
```

The lifecycle-hook server is part of the image artifact. Updating the hook
server therefore requires building/releasing the artifact and publishing a
new compatible image before deploying that image version to the runner lane.

## Image boot and runner lifecycle

The image starts its processes in two layers:

1. Docker starts the S6 overlay (`/init`). The image configures internal
   services, including the CloudWatch Agent, as S6 services. The internal
   services startup script validates the requested service names, exposes the
   MicroVM ID and runner-configuration SSM path to S6, and starts the configured
   services.
2. The image command runs `image-entrypoint.sh`, which executes the Actions
   runner's Node binary with `/opt/microvm/server.js`. That Node process is the
   HTTP endpoint for the AWS Lambda MicroVM lifecycle hooks.

When AWS sends the `run` hook, the server validates the request and passes the
MicroVM ID and `runHookPayload` to the lifecycle handler. The payload identifies
the SSM-backed runner configuration; the hook consumes the one-time JIT runner
configuration from SSM, then starts `/opt/actions-runner/run.sh` with that
configuration. The runner starts as the unprivileged `runner` user, and the
hook waits for the process launch handoff before acknowledging the request.

The `terminate` hook stops the runner process. The server also handles the
runtime's readiness, validation, resume, and suspend hooks. After the runner
exits, the hook cleans up and the Node server shuts down, allowing the MicroVM
to finish its lifecycle.

## Combined EC2 and MicroVM deployment

The [multi-runner orchestration example](examples/multi-runner-orchestration.md) accepts
explicit `runners_lambda_zip` and `webhook_lambda_zip` inputs and configures
both compute providers behind one webhook. Its MicroVM settings require a
published image:

```hcl
compute_provider = {
  aws = {
    microvm = {
      image_arn                 = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:gha-ubuntu-arm64"
      image_version             = null
      ingress_network_connectors = []
      egress_network_connectors  = ["arn:aws:lambda:eu-west-1:123456789012:network-connector:example"]
    }
  }
}
```

Use the example's complete Terraform configuration as the source of truth for
the current input shape. The example deploys the control plane; it does not
build the foundation, lifecycle-hook artifact, or MicroVM image for you.

## Known limitations

- This integration is experimental and depends on AWS Lambda MicroVM APIs and
  the lifecycle-hook protocol.
- A compatible lifecycle-hook server must be present in every image used by
  the MicroVM provider.
- Image publication and activation are separate from Terraform deployment;
  wait for the image version to become active before starting jobs.
- The build role and execution role are intentionally separate. Changes to
  either role can affect a different stage of the lifecycle.
- The combined webhook example is useful for integration testing, but a real
  deployment still needs a real MicroVM image and the network/runtime IAM
  configuration described above.

## Repository examples

- [MicroVM foundation](examples/microvm-foundation.md)
- [MicroVM image build README](https://github.com/github-aws-runners/terraform-aws-github-runner/blob/main/images/microvm-ubuntu/README.md)
- [Lifecycle-hook service README](https://github.com/github-aws-runners/terraform-aws-github-runner/blob/main/lambdas/services/microvm-lifecycle-hooks/README.md)
- [Multi-runner orchestration](examples/multi-runner-orchestration.md)
- [MicroVM foundation module](modules/public/microvm-foundation.md)
