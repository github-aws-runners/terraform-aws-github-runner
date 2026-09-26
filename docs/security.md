
# Security

This module is not certified by any security organization. The module is built with best practices in mind, but it is your responsibility to ensure the security of your environment. We welcome any feedback to improve the security of the module.

## Guidelines and directions

This module creates resources in your AWS infrastructure, and EC2 instances for hosting the self-hosted runners on-demand. IAM permissions are set to a minimal level, and could be further limited by using permission boundaries. Instances permissions are limited to retrieve and delete the registration token, access the instance's own tags, and terminate the instance itself. By nature instances are short-lived, we strongly suggest to use *ephemeral runners* to ensure a safe build environment for each workflow job execution.

Ephemeral runners are using the *JIT configuration*, configuration that only can be used once to activate a runner. For non-ephemeral runners this option is not provided by GitHub. For non-ephemeral runners a registration token is passed via SSM. After using the token, the token is deleted. But the token remains valid and is potential available in memory on the runner. For ephemeral runners this problem is avoided by using just in time tokens.

The examples are using standard AMI's for different operating systems. Instances are not hardened, and sudo operations are not blocked. To provide an out-of-the-box working experience by default the module installs and configures the runner. Even though secrets are not hard-coded, they unavoidably end up in the memory of the instances. We advise to build and harden your own AMIs, you can use the packer images as an example.


## Attestation

The module is released using GitHub Actions and the Lambda artifacts are attached to the release. The release pipeline creates provenance attestations for those artifacts. You can find a link to the attestation in the GitHub release. The attestation only provides provenance information about the release; it is not a security guarantee. We recommend verifying the attestation after downloading the Lambda artifacts.

Releases also publish the multi-architecture scale-set service image to the GitHub Container Registry with an SBOM, build provenance, and a registry attestation. The scale-set module requires callers to select the controller image explicitly; use the immutable image digest printed in the release notes and verify that image with:

```bash
gh attestation verify \
  oci://ghcr.io/github-aws-runners/terraform-aws-github-runner-scale-set-service@sha256:<digest> \
  --repo github-aws-runners/terraform-aws-github-runner
```

## Scale-set security boundaries

The experimental scale-set provider has separate trust boundaries for the ECS
controller, the EC2 compute provider, and GitHub:

- The ECS task role reads only the SSM parameter names supplied for its group,
  including GitHub App references and optional discovery-cache values. The
  controller does not write discovered IDs back to SSM. The compute role owns
  the separate SSM write/delete permissions needed to publish and consume
  runner JIT configuration.
- GitHub App private keys and tokens remain in SSM and are never serialized into
  the controller manifest. Use caller-managed KMS keys and parameter policies
  when the default AWS-owned SSM key is insufficient for your boundary.
- Tasks run in private subnets without public IPs, with no managed security
  group ingress and TCP/443 egress only. The default `0.0.0.0/0` route is a
  reachability default, not a GitHub allowlist. GitHub publishes current
  outbound ranges through [`api.github.com/meta`](https://api.github.com/meta);
  use those ranges or a controlled NAT, firewall, or HTTPS proxy where needed.
- ECS hardening includes a numeric non-root user, a read-only root filesystem,
  dropped Linux capabilities, no privilege escalation, and no Docker socket.
  The task image should be digest-pinned and independently verified.
- Terraform owns the AWS controller substrate and the EC2 runner capacity
  contract. The controller owns the runtime GitHub scale-set API operations,
  including resolving a named set, registering a missing set, and reconciling
  system labels. Terraform only provisions the AWS substrate and never calls
  the GitHub scale-set API; destroying it stops reconciliation without issuing
  a GitHub delete. Avoid configuring the same runner lane in both webhook and
  scale-set orchestration.

The scale-set service follows the message-session and HTTP behavior of the
upstream [`actions/scaleset`](https://github.com/actions/scaleset) Go client.
That protocol was reverse-engineered for compatibility, so treat upstream
changes and GitHub API behavior as operational dependencies and validate image
updates before production rollout.

--8<-- "SECURITY.md:mkdocsrunners"
