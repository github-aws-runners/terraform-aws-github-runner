# Lambda MicroVM compute provider

This provider manages a compatible AWS Lambda MicroVM image through the control-plane Lambda. It currently supports ephemeral JIT runners only.

The MicroVM image `/run` hook receives this `runHookPayload`:

```json
{
  "version": 1,
  "imageArn": "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner",
  "imageVersion": "12.0",
  "runnerConfigSsmPath": "/github-action-runners/example/runners/config",
  "runnerTokenSsmPath": "/github-action-runners/example/runners/tokens"
}
```

Lambda adds `microvmId` beside that payload. `imageArn` and `imageVersion` are the requested launch values and are included together when an explicit image version is selected. The image must poll the SecureString parameter at `<runnerTokenSsmPath>/<microvmId>`, start the GitHub runner with its encoded JIT configuration, delete the parameter after reading it, and exit its lifecycle entrypoint after the job completes. The image separately polls its complete non-secret tag map at `<runnerConfigSsmPath>/microvm-metadata/<microvmId>.tags`. The control plane stores the JIT parameter before the provider callback writes the tag map, preventing cleanup from deleting an absent JIT that could otherwise be recreated later. Neither metadata record contains the JIT configuration value. Trusted control-plane cleanup and the fixed lifetime remain termination backstops.

Runner ownership and lifecycle state are stored separately as non-secret `String`
parameters under `<MICROVM_METADATA_SSM_PATH>/<microvmId>`. The immutable base
record and independent state parameters prevent concurrent GitHub ID, orphan,
and cleanup updates from overwriting one another. Deleting the JIT SecureString
does not delete this metadata. Use a dedicated metadata prefix that does not
overlap the JIT path, and grant the MicroVM execution role only the exact
value-read access described below, without path-listing permissions. The control
plane retries pending cleanup, removes metadata after termination, and reconciles
expired records during inventory.

The immutable base metadata parameter carries the same AWS resource tags that
are serialized as a JSON object in the `<microvmId>.tags` parameter. The tag
set starts with `SSM_PARAMETER_STORE_TAGS`, omits `Name`, and derives
`ghr:environment`, `ghr:ssm_config_path`, and `ghr:runner_name_prefix` from
the existing `ENVIRONMENT`, `SSM_CONFIG_PATH`, and `RUNNER_NAME_PREFIX`
settings. The Lambda then adds authoritative runtime tags:
`ghr:Application`, `ghr:created_by`, `ghr:environment`, `ghr:Owner`,
`ghr:Type`, `ghr:microvm_id`, `ghr:microvm_image_arn`, and, when available,
`ghr:microvm_image_version`. After JIT registration, the control plane adds
`ghr:github_runner_id` and base64url-encoded runner-label groups under
`ghr:runner_labels` through `ghr:runner_labels:5`. Runtime-owned values override
configured collisions. The `aws:` tag prefix is reserved and cannot be used for
these SSM parameters. The `.tags` value may use the Parameter Store advanced
tier when its UTF-8 representation is at least 4,000 bytes and is rejected if
the complete value could exceed the 8 KiB Parameter Store limit.

Final cleanup deletes `<runnerTokenSsmPath>/<microvmId>`, the
`.github-runner-id`, `.orphan`, and `.tags` companions, the base ownership
record, and `.cleanup-requested-at` last. The tombstone keeps its original
timestamp through a five-minute grace window so cleanup can repeatedly revoke a
late JIT write before removing every record. Missing parameters are treated as
already cleaned.

The runner configuration publishes `<runnerConfigSsmPath>/enable_cloudwatch`
and, when enabled, `<runnerConfigSsmPath>/cloudwatch_agent_config_runner`.
The generated agent configuration reads these image-owned files by default:

- `/var/log/microvm/internal-services.log`
- `/var/log/microvm/run.log`
- `/opt/actions-runner/_diag/Runner_**.log`

Their default log-group suffixes are `internal_service`, `run`, and `runner`,
and `{microvm_id}` is an image-expanded log-stream placeholder. The first two
files are part of the MicroVM image contract; the portable lifecycle hook does
not create CloudWatch-specific files. Native RunMicrovm stdout and stderr stay
enabled independently as the early-startup and failure backstop.

The control-plane Lambda requires these provider environment variables:

- `MICROVM_IMAGE_ARN`
- `MICROVM_EXECUTION_ROLE_ARN`
- `MICROVM_IMAGE_VERSION` (optional)
- `MICROVM_INGRESS_NETWORK_CONNECTORS` (optional JSON array or comma-separated list)
- `MICROVM_EGRESS_NETWORK_CONNECTORS` (optional JSON array or comma-separated list)
- `MICROVM_METADATA_SSM_PATH` (dedicated SSM path for control-plane metadata)
- `MICROVM_LOG_GROUP` (optional)
- `SSM_TOKEN_PATH` (lane-scoped JIT parameter path)

Each runner is launched with a fixed lifetime of 28,800 seconds (8 hours).

The control-plane role requires `ssm:GetParametersByPath`, `ssm:GetParameters`,
`ssm:PutParameter`, `ssm:AddTagsToResource`, and `ssm:DeleteParameter` on the
dedicated metadata prefix, plus a separate `ssm:DeleteParameter` grant on the
lane-scoped JIT prefix, and `lambda:ListMicrovms`, `lambda:RunMicrovm`, and
`lambda:TerminateMicrovm` for inventory and lifecycle reconciliation. Restrict
`lambda:RunMicrovm` and `lambda:TerminateMicrovm` to approved image resources;
`lambda:ListMicrovms` does not support resource-level permissions.

The MicroVM execution role must trust `lambda.amazonaws.com` for both
`sts:AssumeRole` and `sts:TagSession`. Restrict `iam:PassRole` to that exact role
ARN. Network connectors also require `lambda:PassNetworkConnector`; because
that action does not currently support resource-level permissions, enforce the
connector boundary with the explicit dynamic-label allowlist described below.

All MicroVMs using one execution role, JIT prefix, and metadata prefix share a
trust boundary. Grant that role only `ssm:GetParameter` on the Parameter Store
ARN corresponding to `<runnerConfigSsmPath>/microvm-metadata/*` and the exact
CloudWatch configuration parameters, `ssm:GetParameter` and
`ssm:DeleteParameter` on the lane-scoped JIT prefix, and stream-write access to
the provider-managed log groups. The image must address its own metadata with
its AWS-provided `microvmId` and must not receive path-listing access. IAM cannot
bind that ID to the calling MicroVM session, so a MicroVM can read other
metadata records in the same lane if it learns their IDs. Only allow trusted
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
