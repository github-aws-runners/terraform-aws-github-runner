# GitHub Actions runner scale sets

!!! warning

    Runner scale sets are available only through `experimental.multi_runner_config`. Both the
    Terraform schema and GitHub's runner scale-set API may change before this feature is stable.

A v2 runner stack can receive demand from a GitHub Actions runner scale set instead of its
`workflow_job` webhook queue. One ECS/Fargate task owns the GitHub message session, continuously
reconciles assigned jobs with EC2 capacity, and provisions ephemeral runners with GitHub's encoded
JIT configuration.

Demand orchestration is selected explicitly per v2 lane. Set exactly one of
`orchestration.webhook` or `orchestration.scale_set`. The webhook provider owns the build queue,
matcher, scale-up/scale-down Lambdas, pool, and job retry; the scale-set provider owns the ECS
listener. The two providers are never active for the same lane, but webhook and scale-set lanes can
coexist in one module deployment when they use distinct lane keys and workflow labels.

The listener is stateful but does not need a database or persistent volume. GitHub retains the
message/session state, while EC2 tags and SSM Parameter Store hold provisioning state. After a task
restart, the replacement session reconstructs capacity from GitHub statistics and the scoped EC2
instances.

## Prerequisites

- Create the GitHub-side runner scale set and record its numeric ID. Terraform does not create or
  delete that GitHub resource.
- Configure the GitHub App ID and private key. A webhook secret is needed only when at least one lane
  selects `orchestration.webhook`.
- Route workflows to labels owned only by that scale set. Do not send the same labels to a webhook
  lane during migration.
- Use ephemeral runners, JIT configuration, an enabled instance metadata endpoint with instance
  metadata tags, and the EC2 provider's default user-data bootstrap.
- If the lane uses an externally managed runner role, grant the default bootstrap's scoped EC2 tag,
  SSM read/delete, and self-termination permissions; the module cannot attach those policies to an
  external role.
- Publish the listener image to a registry reachable by the ECS task execution role.
- Give the Fargate subnets outbound HTTPS access to GitHub, the Actions message service, and the AWS
  APIs used by the listener.

## Build the listener image

The Docker build context is the `lambdas` workspace:

```bash
docker build \
  --platform linux/amd64 \
  --file lambdas/functions/control-plane/Dockerfile.scale-set-listener \
  --tag ghcr.io/example/terraform-aws-github-runner-scale-set:dev \
  lambdas
```

Publish the image for the configured Fargate architecture and resolve it to an immutable digest.
Terraform rejects mutable tags; `container_image` must end in `@sha256:<64 hex characters>`.
The default listener architecture is `x86_64`, matching the `linux/amd64` build above; override both
together when publishing an arm64 image.

## v2 runner-stack configuration

```hcl
experimental = {
  github = {
    app = {
      id_ssm = {
        name = "/github-actions/app-id"
        arn  = "arn:aws:ssm:us-east-1:123456789012:parameter/github-actions/app-id"
      }
      key_base64_ssm = {
        name = "/github-actions/app-key"
        arn  = "arn:aws:ssm:us-east-1:123456789012:parameter/github-actions/app-key"
      }
    }
  }

  compute_provider = {
    ec2 = {
      vpc_id     = "vpc-0123456789abcdef0"
      subnet_ids = ["subnet-0123456789abcdef0", "subnet-0123456789abcdef1"]
    }
  }

  multi_runner_config = {
    scale_set_linux = {
      runner = {
        os                 = "linux"
        architecture       = "arm64"
        maximum_count      = 20
        ephemeral          = true
        jit_config_enabled = true
      }

      orchestration = {
        scale_set = {
          id                = 123
          github_config_url = "https://github.com/example"
          github_app_index  = 0
          min_runners       = 0
          work_folder       = "_work"
          container_image   = "ghcr.io/example/listener@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

          ecs = {
            # Networking inherits the shared Lambda or EC2 provider subnets when omitted.
            assign_public_ip = false
            architecture     = "x86_64"
            # cluster = { arn = aws_ecs_cluster.shared.arn }
          }
        }
      }

      compute_provider = {
        ec2 = {
          instance_types = ["m7g.large"]
        }
      }
    }
  }
}
```

`runner.maximum_count` is the scale set's maximum capacity;
`orchestration.scale_set.min_runners` is its warm capacity floor. `github_config_url` must identify
a GitHub organization or repository. Enterprise scope is not currently supported by the compute
ownership contract.

The service uses `desired_count = 1`, a `0/100` ECS deployment policy, a deployment circuit breaker,
and a 120-second task stop timeout. This deliberately stops the old listener before starting its
replacement so two tasks do not own overlapping message sessions. No load balancer, inbound security
group rule, ECS autoscaling policy, or scheduled listener trigger is created.

A scale-set lane creates no webhook matcher entry, build queue, scale-up/scale-down Lambda, scheduled
pool, or job-retry controller. Shared runner and maintenance resources, including the SSM
housekeeper, remain provider-neutral. A mixed deployment creates the shared webhook only for lanes
that select `orchestration.webhook`.

## Provisioning and shutdown safety

EC2 runners move through `provisioning`, `publishing`, `config-published`, `ready`, `retiring`, and
`stopped` states. The listener records `publishing`, writes the encoded JIT configuration, and then
publishes the `config-published` fence. The default bootstrap must claim and delete that exact SSM
parameter before it marks the instance ready and starts the runner. Surplus warm runners are terminated
only after the listener wins the application-level SSM deletion handshake for their configuration. Ready
runners are never selected as surplus.

Normal scale-down follows GitHub `JobCompleted` messages and terminates the exact ephemeral runner.
Capacity decreases are deliberately drain-only once a runner has claimed its JIT configuration: lowering
`min_runners` or `runner.maximum_count` does not forcibly terminate an already-ready runner because an
idle-status check cannot fence a concurrent job assignment. Ready warm runners that never receive a job
must be drained and removed operationally after such a configuration change.

The SSM deletion is an application-level handshake, not a transactional lease. A listener crash after
deleting the parameter but before persisting `retiring` can leave a non-runnable instance for an operator
to clean up; the listener fails safe and does not treat that ambiguous instance as safe to terminate. A
durable conditional lease would be required to eliminate this narrow liveness gap.

On ECS shutdown, `SIGTERM` aborts the active long poll and the listener closes the GitHub message session
with an independent timeout. Transient failures reconnect with bounded jitter. Fatal configuration or
authentication failures exit non-zero so ECS can replace the task and the optional missing-task alarm can
notify operators.

Changing a lane between webhook and scale-set demand is a coordinated migration. Introduce distinct
labels, move workflows, drain the old demand path, and then change the lane configuration; Terraform does
not provide a zero-gap GitHub-side cutover.
