# Lambda MicroVM runner provider

This provider manages a compatible AWS Lambda MicroVM image through the control-plane Lambda. It currently supports ephemeral JIT runners only.

The MicroVM image `/run` hook receives this `runHookPayload`:

```json
{
  "version": 1,
  "runnerConfigSsmPath": "/github-action-runners/example/token"
}
```

Lambda adds `microvmId` beside that payload. The image must poll the SecureString parameter at `<runnerConfigSsmPath>/<microvmId>`, start the GitHub runner with its encoded JIT configuration, delete the parameter after reading it, and terminate the MicroVM after the job completes.

The control-plane Lambda requires these provider environment variables:

- `MICROVM_IMAGE_ARN`
- `MICROVM_EXECUTION_ROLE_ARN`
- `MICROVM_IMAGE_VERSION` (optional)
- `MICROVM_INGRESS_NETWORK_CONNECTORS` (optional JSON array or comma-separated list)
- `MICROVM_EGRESS_NETWORK_CONNECTORS` (optional JSON array or comma-separated list)
- `MICROVM_MAXIMUM_DURATION_IN_SECONDS` (optional, defaults to 3600)
- `MICROVM_LOG_GROUP` (optional)

## Dynamic labels

When a runner matcher enables dynamic labels, workflow jobs can override the
following `RunMicrovm` inputs:

| Label                                               | Override                                       |
| --------------------------------------------------- | ---------------------------------------------- |
| `ghr-microvm-egress-network-connectors:<arn>`       | One egress network connector ARN               |
| `ghr-microvm-image-arn:<arn>`                       | MicroVM image ARN                              |
| `ghr-microvm-image-version:<version>`               | MicroVM image version                          |
| `ghr-microvm-maximum-duration-in-seconds:<seconds>` | Maximum lifetime from 1 through 28,800 seconds |

Repeat `ghr-microvm-egress-network-connectors:<arn>` to attach multiple
connectors. Specify one ARN per label; `RunMicrovm` accepts at most 10. These
labels replace the lane's configured `MICROVM_EGRESS_NETWORK_CONNECTORS` value
for that job.

Lambda MicroVM does not expose CPU or memory as `RunMicrovm` inputs. Select an
image and version with the required resources instead. Labels such as
`ghr-microvm-memory` are rejected.

Execution roles, ingress network connectors, logging, idle policy, run hook
payloads, and client tokens remain deployment-controlled. Egress connector
overrides change the runner's network boundary and should be restricted to
approved connector ARNs with `awsDynamicLabelsPolicy`.

Use the matcher's `awsDynamicLabelsPolicy` to restrict values accepted from
workflow jobs. The MicroVM policy keys are `egress-network-connectors`,
`image-arn`, `image-version`, and `maximum-duration-in-seconds`. For example:

```json
{
  "restricted_keys": {
    "egress-network-connectors": {
      "allowed": ["arn:aws:lambda:eu-west-1:123456789012:network-connector:github-runner-*"]
    },
    "image-arn": {
      "allowed": ["arn:aws:lambda:eu-west-1:123456789012:microvm-image:github-runner-*"]
    },
    "maximum-duration-in-seconds": {
      "max": 3600
    }
  }
}
```
