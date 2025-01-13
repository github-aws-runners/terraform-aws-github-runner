
# Security

This module is not certified by any security organization. The module is built with best practices in mind, but it is your responsibility to ensure the security of your environment. We welcome any feedback to improve the security of the module.

## Guidelines and directions

This module creates resources in your AWS infrastructure, and EC2 instances for hosting the self-hosted runners on-demand. IAM permissions are set to a minimal level, and could be further limited by using permission boundaries. Instances permissions are limited to retrieve and delete the registration token, access the instance's own tags, and terminate the instance itself. By nature instances are short-lived, we strongly suggest to use *ephemeral runners* to ensure a safe build environment for each workflow job execution.

Ephemeral runners are using the *JIT configuration*, configuration that only can be used once to activate a runner. For non-ephemeral runners this option is not provided by GitHub. For non-ephemeral runners a registration token is passed via SSM. After using the token, the token is deleted. But the token remains valid and is potential available in memory on the runner. For ephemeral runners this problem is avoid by using just in time tokens.

The examples are using standard AMI's for different operation systems. Instances are not hardened, and sudo operation are not blocked. To provide an out of the box working experience by default the module installs and configures the runner. However secrets are not hard coded, they finally end up in the memory of the instances. We advise to build and harden your own AMIs, you can use the packer images as an example.


## Attestation

The module is released using GitHub actions and the lambda artifacts are attached to the release as attachment. During the release attestation are created. The attestation are created by the release pipeline. You find a link to the attestation in the GitHub release. The attestation only provides provenance information about the release. The attestation are not a security guarantee. We recommend you to verify the attestation after downloading the the lambda artifacts.

--8<-- "SECURITY.md:mkdocsrunners"
