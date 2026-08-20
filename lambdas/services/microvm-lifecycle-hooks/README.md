# Lambda MicroVM lifecycle hooks

This service implements the lifecycle-hook HTTP server used to start one ephemeral GitHub Actions runner inside an AWS Lambda MicroVM. Storage-specific reads and one-time consumption are delegated to `@aws-github-runner/storage-providers`; this package owns only payload validation, lifecycle state, and the runner process boundary.

## Build and run

From `lambdas/`:

```bash
yarn nx test @aws-github-runner/microvm-lifecycle-hooks
yarn workspace @aws-github-runner/microvm-lifecycle-hooks build
yarn workspace @aws-github-runner/microvm-lifecycle-hooks start
```

`build` uses NCC to create a self-contained `dist/`. It also writes `dist/package.json` with `type: module`, so the artifact runs after it is copied outside the Yarn workspace. Copy the **entire** directory; do not copy only `index.js`.

To build before invoking Docker, run the workspace build above. In the existing MicroVM runner Dockerfile, which already installs s6-overlay and the GitHub runner's Node 24 runtime, copy the complete artifact and replace the old hook command with:

```dockerfile
COPY lambdas/services/microvm-lifecycle-hooks/dist/ /opt/microvm-lifecycle-hooks/
ENV RUNNER_ENTRYPOINT=/opt/microvm/entrypoint.sh
ENTRYPOINT ["/init"]
CMD ["/command/with-contenv", "/opt/actions-runner/externals/node24/bin/node", "/opt/microvm-lifecycle-hooks/index.js"]
```

Alternatively, build the service inside Docker with the repository root as the build context. Add this pinned builder stage:

```dockerfile
ARG NODE_BUILDER_IMAGE=node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03
FROM ${NODE_BUILDER_IMAGE} AS lifecycle-build
WORKDIR /source
COPY lambdas/ ./lambdas/
RUN corepack enable \
    && cd lambdas \
    && yarn install --immutable \
    && yarn workspace @aws-github-runner/microvm-lifecycle-hooks build
```

Use a clean checkout for that build context, or exclude local `node_modules/`, `coverage/`, and `dist/` directories with `.dockerignore`, so host-built dependencies are not copied into the Linux builder.

Then copy the builder output into the existing final runner stage and use its supervisor and Node 24 runtime:

```dockerfile
COPY --from=lifecycle-build \
    /source/lambdas/services/microvm-lifecycle-hooks/dist/ \
    /opt/microvm-lifecycle-hooks/
ENV RUNNER_ENTRYPOINT=/opt/microvm/entrypoint.sh
ENTRYPOINT ["/init"]
CMD ["/command/with-contenv", "/opt/actions-runner/externals/node24/bin/node", "/opt/microvm-lifecycle-hooks/index.js"]
```

For an image without s6-overlay, start the artifact with `node /opt/microvm-lifecycle-hooks/index.js` under that image's process supervisor. The hook binds to `0.0.0.0:8080` by default. Restrict the port to the Lambda MicroVM lifecycle network; the protocol does not add a separate application authentication layer.

## Run payloads

AWS sends an outer JSON object whose `runHookPayload` is itself a JSON string. Version 1 remains strict and SSM-specific for backwards compatibility:

```json
{
  "microvmId": "microvm-bdd2d536-3d87-35e4-8b40-18664608ebc1",
  "runHookPayload": "{\"version\":1,\"runnerConfigSsmPath\":\"/github-action-runners/example/token\"}"
}
```

Version 1 is translated to the shared allowlisted SSM environment. Version 2 carries the exact environment-variable map under `context.storage`. SSM example:

```json
{
  "version": 2,
  "context": {
    "storage": {
      "RUNNER_CONFIG_STORAGE_PROVIDER": "aws_ssm",
      "SSM_TOKEN_PATH": "/github-action-runners/example/token"
    }
  }
}
```

DynamoDB example:

```json
{
  "version": 2,
  "context": {
    "storage": {
      "RUNNER_CONFIG_STORAGE_PROVIDER": "aws_dynamodb",
      "RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME": "github-runner-state"
    }
  }
}
```

Both versions reject missing, unknown, or provider-incompatible fields. Storage context accepts only the two keys for the selected provider; AWS credentials, timeout overrides, and arbitrary environment names are rejected. The validated storage map is exported once before the consumer is resolved. A retry may reuse the identical map, but it cannot change storage configuration after initialization.

`microvmId` is an opaque path-safe `[A-Za-z0-9_.-]{1,256}` value. The resolved storage provider uses it to consume the one-time JIT configuration. Storage context variables are removed from the runner child environment.

For DynamoDB, the producer must write the runner configuration with `accessScope` equal to `microvmId`; the consumer atomically removes the unexpired `{ scope: microvmId, id: "config" }` item.

For a rolling upgrade, keep emitting version 1 SSM payloads until every deployed image contains this service. Old images do not understand version 2. DynamoDB requires the version 2 payload after the image rollout is complete.

## Entrypoint contract

On `/run`, the hook starts `${RUNNER_ENTRYPOINT:-/opt/microvm/entrypoint.sh} run` without a shell. It writes this versioned document to stdin:

```json
{
  "jitConfig": "<one-time value>",
  "microvmId": "<opaque id>",
  "version": 1
}
```

The entrypoint must write exactly `ready\n` to file descriptor 3 after the runner is ready. The JIT configuration, storage context, and AWS credential environment variables are not passed to the child process. `/terminate` sends `SIGTERM` to the detached process group and escalates to `SIGKILL` after the grace period.

After the runner entrypoint exits on its own, the hook closes its HTTP server and exits with status `0` only when the runner exited cleanly. In the documented s6-overlay image layout above, that makes the foreground container command exit so s6 can stop the remaining image services and shut down the application container's PID 1. This path does not require `lambda:TerminateMicrovm` in the runner role. AWS documents only explicit termination and maximum duration as MicroVM termination triggers, so retain trusted control-plane cleanup and the maximum duration as failure backstops, and verify the container-exit behavior against a restored MicroVM before relying on it operationally.

Useful environment variables are:

| Variable                          | Default                      | Purpose                                       |
| --------------------------------- | ---------------------------- | --------------------------------------------- |
| `HOOK_PORT`                       | `8080`                       | Lifecycle-hook HTTP port                      |
| `RUNNER_ENTRYPOINT`               | `/opt/microvm/entrypoint.sh` | Image-specific runner supervisor              |
| `RUN_HOOK_TIMEOUT_SECONDS`        | `55`                         | Total `/run` budget, bounded to 40–55 seconds |
| `HOOK_HEADERS_TIMEOUT_SECONDS`    | `5`                          | HTTP header receive timeout                   |
| `HOOK_REQUEST_TIMEOUT_SECONDS`    | `10`                         | HTTP request receive timeout                  |
| `HOOK_KEEP_ALIVE_TIMEOUT_SECONDS` | `5`                          | Idle keep-alive timeout                       |
| `AWS_SDK_CALL_TIMEOUT_SECONDS`    | `5`                          | Individual storage-provider call timeout      |
| `RUNNER_CONFIG_TIMEOUT_SECONDS`   | `20`                         | Total runner-configuration polling timeout    |
| `RUNNER_CONFIG_POLL_SECONDS`      | `2`                          | Delay between provider polling attempts       |
| `RUNNER_CONFIG_DELETE_ATTEMPTS`   | `3`                          | SSM one-time configuration delete attempts    |

The request body is capped at 20 KiB and HTTP headers at 16 KiB. Internal errors are returned generically and secret-bearing provider errors are never logged.

## Runtime security

Removing AWS credential and storage variables from the runner child prevents accidental environment inheritance; it is not an IAM boundary. A job can still obtain credentials made available to the runtime role, so scope that role to each lane and treat job code as untrusted.

- For DynamoDB, grant only `dynamodb:DeleteItem` on the lane's runner-state table. Do not grant `Query` or `Scan`, keep the one-time records on a short TTL, and attach the MicroVM through a `NO_INGRESS` network connector.
- For SSM, grant only `ssm:GetParameter` and `ssm:DeleteParameter` on the lane's token path. Add `kms:Decrypt` only for the customer-managed key that encrypts those parameters.

## TypeScript API

The workspace service root is import-safe; importing it does not start the server. It exports the parser, lifecycle, process launcher, storage adapter, and server factories for composition and testing. `src/index.ts` is the executable-only NCC entrypoint. A producer can call `loadRunnerConfigStorageContextFromEnvironment` from `@aws-github-runner/storage-providers/runner-config-consumer` to copy only the selected provider and locator into `context.storage`.
