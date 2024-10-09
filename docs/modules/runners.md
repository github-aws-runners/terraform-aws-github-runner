# Runner module (main)

!!! note
    This is the top-level module located in the root of the repository. The directory [`modules/runners`](../internal/runners/) contains an internal Terraform sub-module used by this and the [mult-runner module](../public/multi-runner/)

This module creates resources in your AWS infrastructure, and EC2 instances for hosting the self-hosted runners on-demand. IAM permissions are set to a minimal level, and could be further limited by using permission boundaries. Instances permissions are limited to retrieve and delete the registration token, access the instance's own tags, and terminate the instance itself. By nature instances are short-lived, we strongly suggest to use ephemeral runners to ensure a safe build environment for each workflow job execution.

Example usages:

- [Basic example](../../examples/default/)
- [Ephemeral example](../../examples/ephemeral/)

--8<-- "README.md:mkdocsrunners"
