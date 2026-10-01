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

## Proposed Scale Set integration

The current MicroVM provider implements the webhook/control-plane contract. It
does not yet implement the separate Scale Set compute-provider contract. A
Scale Set integration should add a MicroVM plugin to the controller's existing
provider registry and expose the matching runtime configuration and IAM
permissions through the Terraform provider contract. This section is an
implementation proposal; it does not claim Scale Set support is available.

### Runtime plugin

Add `lambdas/libs/compute-providers/aws/microvm/scale-set.ts` alongside the
existing EC2 Scale Set plugin. Its plugin should implement
`ScaleSetComputeProviderModule<'microvm'>` and return the existing
`ScaleSetComputeProvider` interface:

```ts
export const provider = {
  type: 'microvm',
  createPlugin: createMicrovmScaleSetPlugin,
} satisfies ScaleSetComputeProviderModule<'microvm'>;
```

Register it in `lambdas/libs/compute-providers/providers.config.scale-set.ts`
and add the package export in `lambdas/libs/compute-providers/package.json`.
The plugin factory should validate its opaque `configuration` at creation,
accept the optional per-runner-config credentials callback, and build AWS SDK
clients with those credentials. It should not depend on Lambda environment
variables from the webhook scale-up function: the Scale Set reconciler runs in
ECS and obtains its AWS access by assuming the provider role.

The MicroVM `reconcile(request)` implementation should:

1. List only active MicroVMs owned by this runner config, GitHub scope, and
   Scale Set. Store that ownership in the existing SSM metadata format so a
   second Scale Set or webhook lane cannot adopt or terminate them.
2. When capacity is needed, launch a MicroVM with the configured image,
   execution role, network connectors, and lifecycle-hook payload. Generate a
   unique runner name and call `request.generateJitConfiguration` for that
   name.
3. Publish the returned JIT value as an SSM `SecureString` at the configured
   token path keyed by the MicroVM ID. The payload passed to the MicroVM should
   point at that same token path. Never put JIT contents in logs, tags, or the
   non-secret Scale Set controller configuration.
4. Record the returned GitHub runner ID/name in provider-owned metadata. If
   launch, metadata, or JIT publication fails, clean up only when it is known
   that the MicroVM cannot have consumed the JIT value; otherwise retain the
   MicroVM and report unknown capacity for a later reconciliation.
5. For scale-down, use `request.runnerStates` and `request.removeRunner`.
   Terminate only after GitHub removal returns `removed`; retain busy and
   unknown runners. Return the contract's launched/terminated/retained counts
   and bounded errors.

The provider should reuse the shared MicroVM API and metadata helpers where
possible, but first make the AWS clients injectable so the ECS provider can
use the credentials supplied by the Scale Set role. The current helpers create
clients from process environment and are coupled to the webhook Lambda's
ambient role.

### Terraform capability and role policy

Replace the empty `scale_set_capability` in
`modules/compute-providers/aws/microvm/scale-set.tf` with the MicroVM runtime
contract:

```hcl
scale_set_capability = {
  configuration_json = jsonencode({
    imageArn            = var.config.image_arn
    imageVersion        = var.config.image_version
    executionRoleArn    = var.runner.iam.role.arn
    ingressConnectors   = var.config.ingress_network_connectors
    egressConnectors    = var.config.egress_network_connectors
    runnerConfigSsmPath = local.ssm_config_ssm_path
    runnerTokenSsmPath = format(
      "/%s/%s",
      trim(var.storage_provider.aws.ssm.paths.root, "/"),
      trim(var.storage_provider.aws.ssm.paths.tokens, "/"),
    )
    metadataSsmPath     = local.microvm_metadata_ssm_path
    environment         = var.prefix
    runnerNamePrefix    = var.runner.name_prefix
  })
  environment_variables = {}
  iam_statements         = local.scale_set_iam_statements
}
```

The actual local names should follow the module's existing SSM path locals.
The non-secret image, paths, and network settings belong in
`configuration_json`; secrets and generated JIT values do not. Add bounded
IAM statements for `lambda:ListMicrovms`, `lambda:PassNetworkConnector`,
`lambda:RunMicrovm`, `lambda:TerminateMicrovm`, the exact MicroVM image
resources, `iam:PassRole` for the runner execution role, and the required SSM
read/write operations scoped to the runner-token and MicroVM metadata paths.
Include `kms:Encrypt` on the configured SSM KMS key when one is selected. Keep
these statements in the provider capability so the Scale Set module can attach
them to its per-runner-config compute role.

The provider output already has a `capabilities.scale_set` slot. Preserve the
existing `microvm` provider type and wire this capability through
`modules/runner-config/outputs.tf` and
`modules/multi-runner/orchestration-provider.scale-set.tf`; the latter should
continue passing the opaque provider contract instead of branching on
`microvm`. Add plan-time validation that rejects Scale Set settings the
MicroVM provider cannot honor, including unsupported OS/architecture or
non-ephemeral runner modes.

### Focused implementation checks

Before describing this provider as supported, cover the following in provider
tests and an end-to-end Scale Set smoke scenario:

- plugin registration, configuration validation, and assumed-role credentials;
- launch, JIT generation, SecureString publication, metadata ownership, and
  rollback after each failed step;
- scale-down behavior for busy, idle, missing, and contradictory GitHub state;
- Terraform output of provider configuration and narrowly scoped IAM actions;
- a real MicroVM boot consuming the one-time JIT parameter through the image's
  lifecycle-hook service, followed by runner removal and MicroVM cleanup.

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
