
# Security

This module creates resources in your AWS infrastructure, and EC2 instances for hosting the self-hosted runners on-demand. IAM permissions are set to a minimal level, and could be further limited by using permission boundaries. Instances permissions are limited to retrieve and delete the registration token, access the instance's own tags, and terminate the instance itself. By nature instances are short-lived, we strongly suggest to use ephemeral runners to ensure a safe build environment for each workflow job execution.

Ephemeral runners are using the JIT configuration, confguration that only can be used once to activate a runner. For non-ephemeral runners this option is not provided by GitHub. For non-ephemeeral runners a registration token is passed via SSM. After using the token, the token is deleted. But the token remains valid and is potential available in memory on the runner. For ephemeral runners this problem is avoid by using just in time tokens.

The examples are using standard AMI's for different operation systems. Instances are not hardened, and sudo operation are not blocked. To provide an out of the box working experience by default the module installs and configures the runner. However secrets are not hard coded, they finally end up in the memory of the instances. You can harden the instance by providing your own AMI and overwriting the cloud-init script.

We welcome any improvement to the standard module to make the default as secure as possible, in the end it remains your responsibility to keep your environment secure.
