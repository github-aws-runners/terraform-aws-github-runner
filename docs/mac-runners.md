# macOS Runners (Experimental)

!!! warning
    This feature is in early stage and should be considered experimental. macOS runners on AWS have unique constraints compared to Linux and Windows runners. Please review all sections below before deploying.

## Overview

The module supports provisioning macOS-based GitHub Actions self-hosted runners on AWS using [Amazon EC2 Mac instances](https://aws.amazon.com/ec2/instance-types/mac/). macOS runners use the `osx` value for the `runner_os` variable and require **dedicated hosts** due to Apple's macOS licensing requirements.

Key differences from Linux/Windows runners:

- **Dedicated hosts required.** EC2 Mac instances must run on dedicated hosts. Each dedicated host can run **only one Mac VM at a time** (1:1 ratio). The module uses `RunInstances` directly instead of the `CreateFleet` API when `use_dedicated_host` is enabled.
- **Longer boot times.** macOS instances can take 6–20 minutes to launch, significantly longer than Linux (~1 min) or Windows (~5 min). The default `minimum_running_time_in_minutes` for `osx` is set to 20 minutes to prevent premature scale-down.
- **~50 minute host recycle time.** After an EC2 Mac instance is terminated, AWS performs install cleanup and software upgrades on the dedicated host before it becomes available again. This process takes approximately **50 minutes**, during which the host cannot launch a new instance.
- **ARM64 (Apple Silicon) and x64 (Intel) support.** Both `mac1.metal` (Intel), `mac2.metal` (M1), and `mac2-m2.metal` (M2) instance types are supported. Set `runner_architecture` accordingly (`x64` or `arm64`).
- **Only ephemeral mode is recommended.** Due to the long host allocation time and dedicated host cost model, we recommend using ephemeral runners.

## Scaling caveats

Running macOS runners at scale introduces challenges that do not exist with Linux or Windows runners:

1. **1:1 host-to-VM ratio.** Unlike Linux where many instances share underlying hardware, each Mac VM requires its own dedicated host. To run N concurrent macOS jobs, you need at least N dedicated hosts.
2. **Host recycle delay.** After a Mac instance is terminated, the dedicated host enters a ~50 minute cleanup cycle (scrubbing, software updates). During this window the host is unavailable. For bursty workloads, you need additional hosts to absorb demand while others recycle.
3. **Capacity planning.** As a rule of thumb, if you expect N peak concurrent macOS jobs and each job takes T minutes, account for the extra ~50 minutes of host downtime per cycle when sizing your host pool.

## Prerequisites

Before deploying macOS runners, you must set up dedicated host infrastructure. There are two approaches:

### Option A: Single dedicated host

The simplest setup — allocate a single dedicated host and reference it directly. This works for low-scale or testing scenarios, but you must update the Terraform configuration whenever you replace the host.

1. **Dedicated Host** — Allocate an EC2 dedicated host for your Mac instance type in the target availability zone.

### Option B: Host resource group (recommended for scale)

A host resource group allows you to associate **multiple dedicated hosts within an availability zone** into a logical group. When launching a Mac instance, AWS randomly selects an available host from the group. This means you can add, release, or replace individual dedicated hosts **without changing Terraform state or module inputs** — you only reference the group ARN, not individual host ARNs.

This approach requires three resources:

1. **Dedicated Hosts** — Allocate one or more EC2 dedicated hosts for Mac instance types in your target availability zones.
2. **Host Resource Group** — Create an AWS Resource Groups group of type `AWS::EC2::HostManagement` and add your dedicated hosts as members.
3. **License Configuration** — Create an AWS License Manager license configuration for Mac dedicated hosts (counting type: `Socket`). Associate it with the macOS AMI and the host resource group. The license configuration ARN is passed to the module via the `license_specifications` input.

The [dedicated-mac-hosts example](examples/dedicated-mac-hosts.md) provides a ready-to-use Terraform configuration for all three resources.

## Configuration

### Basic setup

```hcl
module "runners" {
  source = "github-aws-runners/github-runners/aws"

  # macOS-specific settings
  runner_os           = "osx"
  runner_architecture = "arm64"  # or "x64" for Intel Mac instances
  instance_types      = ["mac2.metal"]

  # Dedicated host settings (required for macOS)
  use_dedicated_host = true
  placement = {
    host_resource_group_arn = "<arn-of-your-host-resource-group>"
  }
  license_specifications = ["<arn-of-your-license-configuration>"]

  # Recommended: ephemeral mode with a pool
  enable_ephemeral_runners = true
  delay_webhook_event      = 0
  enable_job_queued_check  = true

  # ...other common settings...
}
```

### AMI selection

By default, the module selects an Amazon EC2 macOS Sequoia (macOS 15) AMI:

- **ARM64:** `amzn-ec2-macos-15.*-arm64`
- **x64:** `amzn-ec2-macos-15.*`

You can override the AMI using filters or an SSM parameter:

```hcl
# Custom AMI filter
ami = {
  filter = {
    name  = ["amzn-ec2-macos-14.*-arm64"]
    state = ["available"]
  }
  owners = ["amazon"]
}

# Or via SSM parameter
ami = {
  id_ssm_parameter_arn = "arn:aws:ssm:region:account:parameter/path/to/mac/ami"
}
```

### Multi-runner setup

When using the multi-runner module, you can add a macOS runner configuration alongside Linux and Windows runners:

```hcl
multi_runner_config = {
  "mac-arm64" = {
    runner_config = {
      runner_os           = "osx"
      runner_architecture = "arm64"
      instance_types      = ["mac2.metal"]
      use_dedicated_host  = true
      placement = {
        host_resource_group_arn = "<arn-of-your-host-resource-group>"
      }
      license_specifications = ["<arn-of-your-license-configuration>"]
      runner_extra_labels    = ["osx", "arm64"]
    }
    matcherConfig = {
      labelMatchers = [["self-hosted", "osx", "arm64"]]
      exactMatch    = false
    }
  }
}
```

## Instance launch behavior

Because EC2 Fleet (`CreateFleet`) does not support launching instances onto dedicated hosts for `mac*.metal` instance types, the scale-up lambda automatically falls back to using `RunInstances` when `use_dedicated_host` is `true`. This is handled transparently — no additional configuration is needed.

## User data and scripts

The module uses macOS-specific templates for provisioning:

| Script | Description |
| --- | --- |
| `user-data-osx.sh` | Boot script for macOS instances. Uses `ec2-user` and supports Homebrew. |
| `install-runner-osx.sh` | Downloads and installs the GitHub Actions runner agent to `/opt/actions-runner`. |
| `start-runner-osx.sh` | Registers the runner with GitHub and handles ephemeral cleanup. |

Custom pre/post install scripts and job hooks (`hook_job_started`, `hook_job_completed`) work the same as on Linux.

## Scale-down considerations

macOS instances have a default minimum running time of **20 minutes** (vs. 5 for Linux, 15 for Windows) to account for the longer boot cycle. Adjust `minimum_running_time_in_minutes` if needed, but setting it too low risks terminating instances before they can execute a job.

Additionally, remember that after an instance is terminated, the dedicated host enters a **~50 minute cleanup cycle** before it can launch a new instance. Aggressive scale-down can leave you with no available hosts during this window.

```hcl
# Override the minimum running time (not recommended to go below 20 for macOS)
minimum_running_time_in_minutes = 25
```

## Cost considerations

!!! note
    macOS dedicated hosts have a **minimum allocation period of 24 hours**. You are billed for the dedicated host for the full 24-hour period, regardless of instance usage. Plan your host allocation accordingly.

- **Dedicated host costs**: Billed per-host, per-hour with a 24-hour minimum. Each host supports only one Mac VM at a time. See [EC2 Dedicated Hosts Pricing](https://aws.amazon.com/ec2/dedicated-hosts/pricing/).
- **Instance costs**: Mac instances are billed on-demand only (no spot pricing available for Mac instances).
- **Over-provisioning for recycle time**: Because hosts are unavailable for ~50 minutes after instance termination, you may need more dedicated hosts than your peak concurrency to avoid queuing. Factor this into your cost model.
- **Pool sizing**: Keep pool sizes minimal to control costs, but large enough to avoid cold-start delays.

## Known limitations

- **No spot instance support.** EC2 Mac instances do not support the spot lifecycle. Runners always use on-demand pricing.
- **1:1 host-to-VM ratio.** Each dedicated host can run only one Mac instance at a time.
- **~50 minute host recycle time.** After instance termination, AWS performs cleanup and software upgrades on the dedicated host. The host is unavailable for approximately 50 minutes during this process.
- **24-hour minimum host allocation.** Dedicated hosts cannot be released within 24 hours of allocation.
- **Limited instance types.** Only `mac1.metal` (Intel x86), `mac2.metal` (M1 ARM64), and `mac2-m2.metal` (M2 ARM64) are available. Instance type availability varies by region.
- **Longer startup.** Boot times of 6–20 minutes mean jobs will queue longer when no warm runners are available.
- **No SSM Session Manager.** Unlike Linux instances, connecting via AWS Session Manager may not be available depending on your AMI.
- **GHES not tested.** macOS runner support has not been validated against GitHub Enterprise Server.

## Debugging

- Check `/var/log/user-data.log` on the macOS instance for boot script output.
- CloudWatch log streams under `<environment>/runners` will contain runner agent logs if CloudWatch logging is enabled.
- Verify your dedicated host has available capacity in the EC2 console under **Dedicated Hosts**.
- Ensure the host resource group ARN and license configuration ARN match what is configured in Terraform.
- If runners fail to register, verify the GitHub App has the correct permissions and the SSM token path is accessible.

## Example

A complete example for setting up the dedicated host infrastructure is available at:

- [Dedicated Mac Hosts example](examples/dedicated-mac-hosts.md)
