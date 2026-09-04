
# Security

This module is not certified by any security organization. The module is built with best practices in mind, but it is your responsibility to ensure the security of your environment. We welcome any feedback to improve the security of the module.

## Guidelines and directions

This module creates resources in your AWS infrastructure, and EC2 instances for hosting the self-hosted runners on-demand. IAM permissions are set to a minimal level, and could be further limited by using permission boundaries. Instances permissions are limited to retrieve and delete the registration token, access the instance's own tags, and terminate the instance itself. By nature instances are short-lived, we strongly suggest to use *ephemeral runners* to ensure a safe build environment for each workflow job execution.

Ephemeral runners are using the *JIT configuration*, configuration that only can be used once to activate a runner. For non-ephemeral runners this option is not provided by GitHub. For non-ephemeral runners a registration token is passed via SSM. After using the token, the token is deleted. But the token remains valid and is potential available in memory on the runner. For ephemeral runners this problem is avoided by using just in time tokens.

The examples are using standard AMI's for different operating systems. Instances are not hardened, and sudo operations are not blocked. To provide an out-of-the-box working experience by default the module installs and configures the runner. Even though secrets are not hard-coded, they unavoidably end up in the memory of the instances. We advise to build and harden your own AMIs, you can use the packer images as an example.


## Attestation

The module is released using GitHub Actions and the Lambda artifacts are attached to the release. The release pipeline creates provenance attestations for those artifacts. You can find a link to the attestation in the GitHub release. The attestation only provides provenance information about the release; it is not a security guarantee. We recommend verifying the attestation after downloading the Lambda artifacts.

Releases also publish the multi-architecture scale-set service image to the GitHub Container Registry with an SBOM, build provenance, and a registry attestation. The convenience image default follows the latest module release. Production deployments should override it with the immutable image digest printed in the release notes, then verify that image with:

```bash
gh attestation verify \
  oci://ghcr.io/github-aws-runners/terraform-aws-github-runner-scale-set-service@sha256:<digest> \
  --repo github-aws-runners/terraform-aws-github-runner
```

--8<-- "SECURITY.md:mkdocsrunners"
