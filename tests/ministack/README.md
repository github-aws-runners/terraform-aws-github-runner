# MiniStack example lifecycle tests

The MiniStack workflow runs explicit `terraform apply` and `terraform destroy`
commands from each checked-in `examples/<name>` root. MiniStack-specific values
are supplied through ordinary example inputs in `tests/ministack/inputs`; no
Terraform configuration is copied into or layered over an example.

Terraform data, state, and the inert Lambda archive live under the runner's
temporary directory. The small `tests/ministack/setup` root is a prerequisite,
not the code under test: it creates the inert archive and seeds the external SSM
parameters consumed by the external-secrets and multi-runner examples. The
archive prevents scheduled or S3-triggered Lambda functions from making GitHub
calls. The GitHub App updater is outside this AWS-only lifecycle test and is
excluded with a Terraform target.

The runner accepts only `http://127.0.0.1:4566`, `http://localhost:4566`, or
`http://ministack:4566` as the AWS endpoint and always replaces ambient AWS
credentials with synthetic MiniStack identifiers. It also rejects
service-specific endpoint variables and ignores ambient AWS profile files so
they cannot bypass the validated global endpoint.

| Example | Lifecycle coverage |
| --- | --- |
| `base` | VPC and Resource Groups |
| `default` | Full default runner stack |
| `ephemeral` | Ephemeral runner and job-retry stack |
| `external-managed-ssm-secrets` | Runner stack with fixture-owned external SSM parameters |
| `multi-runner` | All runner lanes: public/private SSM wiring for Linux x64/ARM64 and module-managed AMI parameters for three lanes |
| `permissions-boundary` | IAM setup, assumed-role runner stack, and reverse-order teardown |
| `prebuilt` | Prebuilt-runner stack using a MiniStack AMI |
| `termination-watcher` | Standalone termination watcher |

Two examples are intentionally outside the matrix:

- `dedicated-mac-hosts` requires the EC2 Dedicated Hosts and License Manager
  APIs, which MiniStack v1.5.0 does not implement.
- `lambdas-download` has no AWS resources. Its apply operation downloads release
  archives from GitHub, so it is not a MiniStack lifecycle test. The underlying
  `download-lambda` module remains in the existing module validation matrix.
