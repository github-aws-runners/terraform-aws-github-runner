# Lambda MicroVM compute provider

This provider manages a compatible AWS Lambda MicroVM image through the control-plane Lambda. It currently supports ephemeral JIT runners only.

The MicroVM image `/run` hook receives this `runHookPayload`:

```json
{
  "version": 1,
  "runnerConfigSsmPath": "/github-action-runners/example/token"
}
```

Lambda adds `microvmId` beside that payload. The image must poll the SecureString parameter at `<runnerConfigSsmPath>/<microvmId>`, start the GitHub runner with its encoded JIT configuration, delete the parameter after reading it, and terminate the MicroVM after the job completes.

Runner ownership and lifecycle state are stored separately as non-secret `String`
parameters under `<MICROVM_METADATA_SSM_PATH>/<microvmId>`. The immutable base
record and independent state parameters prevent concurrent GitHub ID, orphan,
and cleanup updates from overwriting one another. Deleting the JIT SecureString
does not delete this metadata. Use a dedicated metadata prefix that does not
overlap the JIT path, and do not grant the MicroVM execution role access to it.
The control plane retries pending cleanup, removes metadata after termination,
and reconciles expired records during inventory.

The control-plane Lambda requires these provider environment variables:

- `MICROVM_IMAGE_ARN`
- `MICROVM_EXECUTION_ROLE_ARN`
- `MICROVM_IMAGE_VERSION` (optional)
- `MICROVM_INGRESS_NETWORK_CONNECTORS` (optional JSON array or comma-separated list)
- `MICROVM_EGRESS_NETWORK_CONNECTORS` (optional JSON array or comma-separated list)
- `MICROVM_METADATA_SSM_PATH` (dedicated SSM path for control-plane metadata)
- `MICROVM_LOG_GROUP` (optional)

Each runner is launched with a fixed lifetime of 28,800 seconds (8 hours).

The control-plane role requires `ssm:GetParametersByPath`, `ssm:PutParameter`,
and `ssm:DeleteParameter` on the dedicated metadata prefix, plus
`lambda:ListMicrovms`, `lambda:RunMicrovm`, and `lambda:TerminateMicrovm` for
inventory and lifecycle reconciliation. Restrict `lambda:RunMicrovm` and
`lambda:TerminateMicrovm` to approved image resources; `lambda:ListMicrovms`
does not support resource-level permissions.

The MicroVM execution role must trust `lambda.amazonaws.com` for both
`sts:AssumeRole` and `sts:TagSession`. Restrict `iam:PassRole` to that exact role
with `iam:PassedToService=lambda.amazonaws.com`. Egress connectors also require
`lambda:PassNetworkConnector`; because that action does not currently support
resource-level permissions, enforce the connector boundary with the explicit
dynamic-label allowlist described below.

All MicroVMs using one execution role and JIT prefix share a trust boundary.
Grant that role only `ssm:GetParameter` and `ssm:DeleteParameter` on the JIT
prefix; do not grant parameter-listing APIs or access to the metadata prefix.
The `MicrovmId` tag on each JIT parameter supports operations but is not a
documented binding to the calling MicroVM's session identity. Only allow trusted
images and workloads within a shared role, or isolate trust domains with
separate roles, prefixes, and provider deployments.

## Dynamic labels

When a runner matcher enables dynamic labels, workflow jobs can override the
following `RunMicrovm` inputs:

| Label                                         | Override                         |
| --------------------------------------------- | -------------------------------- |
| `ghr-microvm-egress-network-connectors:<arn>` | One egress network connector ARN |
| `ghr-microvm-image-arn:<arn>`                 | MicroVM image ARN                |
| `ghr-microvm-image-version:<version>`         | MicroVM image version            |

Repeat `ghr-microvm-egress-network-connectors:<arn>` to attach multiple
connectors. Specify one ARN per label; `RunMicrovm` accepts at most 10. These
labels replace the compute provider's configured
`MICROVM_EGRESS_NETWORK_CONNECTORS` value for that job.

Lambda MicroVM does not expose CPU or memory as `RunMicrovm` inputs. Select an
image and version with the required resources instead. Labels such as
`ghr-microvm-memory` are rejected.

Execution roles, ingress network connectors, logging, idle policy, run hook
payloads, and client tokens remain deployment-controlled. Image ARN, image
version, and egress connector overrides change executable code or the network
boundary, so they are rejected unless `awsDynamicLabelsPolicy` supplies an
explicit `allowed` list for the corresponding key.

Use the matcher's `awsDynamicLabelsPolicy` to restrict values accepted from
workflow jobs. The MicroVM policy keys are `egress-network-connectors`,
`image-arn`, and `image-version`. For example:

```json
{
  "restricted_keys": {
    "egress-network-connectors": {
      "allowed": ["arn:aws:lambda:eu-west-1:123456789012:network-connector:github-runner-*"]
    },
    "image-arn": {
      "allowed": ["arn:aws:lambda:eu-west-1:123456789012:microvm-image:github-runner-*"]
    },
    "image-version": {
      "allowed": ["3.*"]
    }
  }
}
```
