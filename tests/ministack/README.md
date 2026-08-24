# MiniStack example lifecycle tests

The MiniStack workflow runs explicit `terraform apply` and `terraform destroy`
commands against the repository's runnable AWS examples. Every matrix entry gets
an isolated source tree, Terraform state, and MiniStack service.

The fixture creates synthetic SSM values through MiniStack and an inert Lambda
archive under its ignored `.terraform/` directory. Test-only Terraform override
files route each example to that archive and a MiniStack AMI. They also disable
the `webhook-github-app` local-exec module, which would otherwise update a real
GitHub App. The production example configurations are not changed.

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
