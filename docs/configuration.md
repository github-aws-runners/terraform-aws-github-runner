# Configuration

## Configuration considerations

To be able to support a number of use-cases, the module has quite a lot of configuration options. We tried to choose reasonable defaults. Several examples also show the main cases of how to configure the runners.

- Org vs Repo level. You can configure the module to connect the runners in GitHub on an org level and share the runners in your org, or set the runners on repo level and the module will install the runner to the repo. There can be multiple repos but runners are not shared between repos.
- Multi-Runner module. This modules allows you to create multiple runner configurations with a single webhook and single GitHub App to simplify deployment of different types of runners. Check the detailed module [documentation](modules/public/multi-runner.md) for more information or checkout the [multi-runner example](examples/multi-runner.md).
- Webhook mode, the module can be deployed in `direct` mode or `EventBridge` (Experimental) mode. The `direct` mode is the default and will directly distribute to SQS for the scale-up lambda. The `EventBridge` mode will publish the events to a eventbus, the rule then directs the received events to a dispatch lambda. The dispatch lambda will send the event to the SQS queue. The `EventBridge` mode is the default and allows to have more control over the events and potentially filter them. The `EventBridge` mode can be disabled, messages are sent directed to queues in that case. An example of what the `EventBridge` mode could be used for is building a data lake, build metrics, act on `workflow_job` job started events, etc.
- Linux vs Windows. You can configure the OS types linux and win. Linux will be used by default.
- Reuse vs Ephemeral. By default runners are reused, until detected idle. Once idle they will be removed from the pool. To improve security we are introducing ephemeral runners. Those runners are only used for one job. Ephemeral runners only work in combination with the workflow job event. For ephemeral runners the lambda requests a JIT (just in time) configuration via the GitHub API to register the runner. [JIT configuration](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-just-in-time-runners) is limited to ephemeral runners (and currently not supported by GHES). For non-ephemeral runners, a registration token is always requested. In both cases the configuration is made available to the instance via the same SSM parameter. To disable JIT configuration for ephemeral runners set `enable_jit_config` to `false`. We also suggest using a pre-build AMI to improve the start time of jobs for ephemeral runners.
- Job retry (**Beta**). By default the scale-up lambda will discard the message when it is handled. Meaning in the ephemeral use-case an instance is created. The created runner will ask GitHub for a job, no guarantee it will run the job for which it was scaling. Result could be that with small system hick-up the job is keeping waiting for a runner. Enable a pool (org runners) is one option to avoid this problem. Another option is to enable the job retry function. Which will retry the job after a delay for a configured number of times.
- GitHub Cloud vs GitHub Enterprise Server (GHES). The runners support GitHub Cloud (Public GitHub - github.com), GitHub Data Residency instances (ghe.com), and GitHub Enterprise Server. For GHES, we rely on our community for support and testing. We have no capability to test GHES ourselves.
- Spot vs on-demand. The runners use either the EC2 spot or on-demand lifecycle. Runners will be created via the AWS [CreateFleet API](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateFleet.html). The module (scale up lambda) will request via the CreateFleet API to create instances in one of the subnets and of the specified instance types.
- ARM64 support via Graviton/Graviton2 instance-types. When using the default example or top-level module, specifying `instance_types` that match a Graviton/Graviton 2 (ARM64) architecture (e.g. a1, t4g or any 6th-gen `g` or `gd` type), you must also specify `runner_architecture = "arm64"` and the sub-modules will be automatically configured to provision with ARM64 AMIs and leverage GitHub's ARM64 action runner. See below for more details.
- Disable default labels for the runners (os, architecture and `self-hosted`) can achieve by setting `runner_disable_default_labels` = true. If enabled, the runner will only have the extra labels provided in `runner_extra_labels`. In case you on own start script is used, this configuration parameter needs to be parsed via SSM.

## AWS SSM Parameters

The module uses the AWS System Manager Parameter Store to store configuration for the runners, as well as registration tokens and secrets for the Lambdas. Paths for the parameters can be configured via the variable `ssm_paths`. The location of the configuration parameters is retrieved by the runners via the instance tag `ghr:ssm_config_path`. The following default paths will be used. Tokens or JIT config stored in the token path will be deleted after retrieval by instance, data not deleted after a day will be deleted by a SSM housekeeper lambda.

Furthermore, to accommodate larger JIT configurations or other stored values, the module implements automatic tier selection for SSM parameters:

-   **Parameter Tiering**: If the size of a parameter's value exceeds 4KB (specifically, 4000 bytes), the module will automatically use the 'Advanced' tier for that SSM parameter. Values smaller than this threshold will use the 'Standard' tier.
-   **Cost Implications**: While the 'Standard' tier is generally free for a certain number of parameters and operations, the 'Advanced' tier incurs costs. These costs are typically pro-rated per hour for each parameter stored using the Advanced tier. For detailed and up-to-date pricing, please refer to the [AWS Systems Manager Pricing page](https://aws.amazon.com/systems-manager/pricing/#Parameter_Store).
-   **Housekeeping Recommendation**: The last sentence of the "AWS SSM Parameters" section already mentions that "data not deleted after a day will be deleted by a SSM housekeeper lambda." It is crucial to ensure this or a similar housekeeping mechanism is active and correctly configured, especially considering the potential costs associated with 'Advanced' tier parameters. This utility should identify and delete any orphaned parameters to help manage costs and maintain a clean SSM environment.

| Path                                                          | Description                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ssm_paths.root/var.prefix?/app/`                             | App secrets used by Lambda's                                                                                                                                                                                                    |
| `ssm_paths.root/var.prefix?/runners/config/<name>`            | Configuration parameters used by runner start script                                                                                                                                                                            |
| `ssm_paths.root/var.prefix?/runners/tokens/<ec2-instance-id>` | Either JIT configuration (ephemeral runners) or registration tokens (non ephemeral runners) generated by the control plane (scale-up lambda), and consumed by the start script on the runner to activate / register the runner. |
| `ssm_paths.root/var.prefix?/webhook/runner-matcher-config`    | Runner matcher config used by webhook to decide the target for the webhook event.                                                                                                                                               |

Available configuration parameters:

| Parameter name           | Description                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `agent_mode`             | Indicates if the agent is running in ephemeral mode or not.                                       |
| `disable_default_labels` | Indicates if the default labels for the runners (os, architecture and `self-hosted`) are disabled |
| `enable_cloudwatch`      | Configuration for the cloudwatch agent to stream logging.                                         |
| `run_as`                 | The user used for running the GitHub action runner agent.                                         |
| `token_path`             | The path where tokens are stored.                                                                 |

### Note regarding GitHub App secrets provisioning in SSM

SSM parameters for GitHub App secrets (`webhook_secret`, `key_base64`, `id`) can also be manually created at the SSM path of your choice.

If you opt for this approach, please fill the `*_ssm` attributes of the `github_app` variable as following:

```
github_app = {
    key_base64_ssm     = {
      name = "/your/path/to/ssm/parameter/key-base-64"
      arn = "arn:aws:ssm:::parameter/your/path/to/ssm/parameter/key-base-64"
    }
    id_ssm             = {
      name = "/your/path/to/ssm/parameter/id"
      arn = "arn:aws:ssm:::parameter/your/path/to/ssm/parameter/id"
    }
    webhook_secret_ssm = {
      name = "/your/path/to/ssm/parameter/webhook-secret"
      arn = "arn:aws:ssm:::parameter/your/path/to/ssm/parameter/webhook-secret"
    }
  }
```

Manually creating the SSM parameters that hold the configuration of your GitHub App avoids leaking critical plain text values in your terraform state and version control system. This is a recommended security practice for handling sensitive credentials.

You can read more [over here](../examples/external-managed-ssm-secrets/README.md).

## Encryption

The module supports two scenarios to manage environment secrets and private keys of the Lambda functions.

### Managed KMS key (default)

This is the default, no additional configuration is required.

### Provided KMS key

You have to create and configure you KMS key. The module will use the context with key: `Environment` and value `var.environment` as encryption context.

```hcl
resource "aws_kms_key" "github" {
  is_enabled = true
}

module "runners" {

  ...
  kms_key_arn = aws_kms_key.github.arn
  ...
```

## Pool

The module supports two options for keeping a pool of runners. One is via a pool which only supports org-level runners, the second option is [keeping runners idle](#idle-runners).

The pool is introduced in combination with the ephemeral runners and is primarily meant to ensure if any event is unexpectedly dropped and no runner was created, the pool can pick up the job. The pool is maintained by a lambda. Each time the lambda is triggered a check is performed to ensure the number of idle runners managed by the module matches the expected pool size. If not, the pool will be adjusted. Keep in mind that the scale down function is still active and will terminate instances that are detected as idle.

```hcl
pool_runner_owner = "my-org"                  # Org to which the runners are added
pool_config = [{
  size                         = 20                    # size of the pool
  schedule_expression          = "cron(* * * * ? *)"   # cron expression to trigger the adjustment of the pool
  schedule_expression_timezone = "Australia/Sydney"    # optional time zone (defaults to UTC)
}]
```

The pool is NOT enabled by default and can be enabled by setting at least one object of the pool config list. The [ephemeral example](examples/ephemeral.md) contains configuration options (commented out).

## Idle runners

The module will scale down to zero runners by default. By specifying a `idle_config` config, idle runners can be kept active. The scale down lambda checks if any of the cron expressions matches the current time with a margin of 5 seconds. When there is a match, the number of runners specified in the idle config will be kept active. In case multiple cron expressions match, the first one will be used. Below is an idle configuration for keeping runners active from 9:00am to 5:59pm on working days. The [cron expression generator by Cronhub](https://crontab.cronhub.io/) is a great resource to set up your idle config.

By default, the oldest instances are evicted. This helps keep your environment up-to-date and reduce problems like running out of disk space or RAM. Alternatively, if your older instances have a long-living cache, you can override the `evictionStrategy` to `newest_first` to evict the newest instances first instead.

```hcl
idle_config = [{
   cron             = "* * 9-17 * * 1-5"
   timeZone         = "Europe/Amsterdam"
   idleCount        = 2
   # Defaults to 'oldest_first'
   evictionStrategy = "oldest_first"
}]
```

_**Note**_: When using Windows runners, we recommend keeping a few runners warmed up due to the minutes-long cold start time.

#### Supported config <!-- omit in toc -->

Cron expressions are parsed by [cron-parser](https://github.com/harrisiirak/cron-parser#readme). The supported syntax.

```bash
*    *    *    *    *    *
┬    ┬    ┬    ┬    ┬    ┬
│    │    │    │    │    |
│    │    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
│    │    │    │    └───── month (1 - 12)
│    │    │    └────────── day of month (1 - 31)
│    │    └─────────────── hour (0 - 23)
│    └──────────────────── minute (0 - 59)
└───────────────────────── second (0 - 59, optional)
```

For time zones please check [TZ database name column](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) for the supported values.

## Ephemeral runners

You can configure runners to be ephemeral, in which case runners will be used only for one job. The feature should be used in conjunction with listening for the workflow job event. Please consider the following:

- The scale down lambda is still active, and should only remove orphan instances. But there is no strict check in place. So ensure you configure the `minimum_running_time_in_minutes` to a value that is high enough to get your runner booted and connected to avoid it being terminated before executing a job.
- The messages sent from the webhook lambda to the scale-up lambda are by default delayed by SQS, to give available runners a chance to start the job before the decision is made to scale more runners. For ephemeral runners there is no need to wait. Set `delay_webhook_event` to `0`.
- All events in the queue will lead to a new runner created by the lambda. By setting `enable_job_queued_check` to `true` you can enforce a rule of only creating a runner if the event has a correlated queued job. Setting this can avoid creating useless runners. For example, a job getting cancelled before a runner was created or if the job was already picked up by another runner. We suggest using this in combination with a pool.
- Errors related to scaling should be retried via SQS. You can configure `job_queue_retention_in_seconds` and `redrive_build_queue` to tune the behavior. We have no mechanism to avoid events never being processed, which means potentially no runner gets created and the job in GitHub times out in 6 hours.

The example for [ephemeral runners](examples/ephemeral.md) is based on the [default example](examples/default.md). Have look at the diff to see the major configuration differences.

## Job retry (**Beta**)

You can enable the job retry function to retry a job after a delay for a configured number of times. The function is disabled by default. To enable the function set `job_retry.enable` to `true`. The function will check the job status after a delay, and when the is still queued, it will create a new runner. The new runner is created in the same way as the others via the scale-up function. Hence the same configuration applies.

For checking the job status a API call is made to GitHub. Which can exhaust the GitHub API more quickly for larger deployments and cause rate limits. For larger deployment with a lot of frequent jobs having a small pool available could be a better choice.

The option `job_retry.delay_in_seconds` is the delay before the job status is checked. The delay is increased by the factor `job_retry.delay_backoff` for each attempt. The upper bound for a delay is 900 seconds, which is the max message delay on SQS. The maximum number of attempts is configured via `job_retry.max_attempts`. The delay should be set to a higher value than the time it takes to start a runner.

## Prebuilt Images

This module also allows you to run agents from a prebuilt AMI to gain faster startup times. The module provides several examples to build your own custom AMI. To remove old images, an [AMI housekeeper module](modules/public/ami-housekeeper.md) can be used. See the [AMI examples](ami-examples/index.md) for more details.

## AMI Configuration

> **Note:** By default, a runner AMI update requires a re-apply of the terraform configuration, as the runner AMI ID is looked up by a terraform data source. To avoid this, you can use or `ami.id_ssm_parameter_arn` to have the scale-up lambda dynamically lookup the runner AMI ID from an SSM parameter at instance launch time. Said SSM parameter is managed outside of this module (e.g. by a runner AMI build workflow).

By default, the module will automatically select appropriate AMI images:

- For Linux x64: Amazon Linux 2023 x86_64
- For Linux ARM64: Amazon Linux 2023 ARM64
- For Windows: Windows Server 2022 English Full ECS Optimized

However, you can override these defaults using the `ami` object in two ways:

1. **Using AMI Filters**

You can define filters and owners to look up an AMI. The module will store the AMI ID in an SSM parameter that is managed by the module.

```hcl
ami = {
  filter = {
    name   = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-*"]
    state  = ["available"]
  }
  owners = ["amazon"]
}
```

2. **Using SSM Parameter**

Provide a parameter in SSM that contains the AMI ID. The parameter should be of type `String` and the module will grant the required lambdas access to this parameter.

```hcl
ami = {
  id_ssm_parameter_arn = "arn:aws:ssm:region:account:parameter/path/to/ami/parameter"
}
```

## Logging

The module uses [AWS Lambda Powertools](https://awslabs.github.io/aws-lambda-powertools-typescript/latest/) for logging. By default the log level is set to `info`, by setting the log level to `debug` the incoming events of the Lambda are logged as well.

Log messages contains at least the following keys:

- `messages`: The logged messages
- `environment`: The environment prefix provided via Terraform
- `service`: The lambda
- `module`: The TypeScript module writing the log message
- `function-name`: The name of the lambda function (prefix + function name)
- `github`: Depending on the lambda, contains GitHub context
- `runner`: Depending on the lambda, specific context related to the runner

An example log message of the scale-up function:

```json
{
  "level": "INFO",
  "message": "Received event",
  "service": "runners-scale-up",
  "timestamp": "2023-03-20T08:15:27.448Z",
  "xray_trace_id": "1-6418161e-08825c2f575213ef760531bf",
  "module": "scale-up",
  "region": "eu-west-1",
  "environment": "my-linux-x64",
  "aws-request-id": "eef1efb7-4c07-555f-9a67-b3255448ee60",
  "function-name": "my-linux-x64-scale-up",
  "runner": {
    "type": "Repo",
    "owner": "test-runners/multi-runner"
  },
  "github": {
    "event": "workflow_job",
    "workflow_job_id": "1234"
  }
}
```

## Tracing

The distributed architecture of this application can make it difficult to troubleshoot. We support the option to enable tracing for all the lambda functions created by this application. To enable tracing, you can provide the `tracing_config` option inside the root module or inner modules.

This tracing config generates timelines for following events:

- Basic lifecycle of lambda function
- Traces for GitHub API calls (can be configured by capture_http_requests).
- Traces for all AWS SDK calls

This feature has been disabled by default.

### Multiple runner module in your AWS account

The watcher will act on all spot termination notifications and log the ones relevant to the runner module. Therefor we suggest to only deploy the watcher once. You can either deploy the watcher by enabling in one of your deployments or deploy the watcher as a stand alone module.

## Metrics

The module supports metrics (experimental feature) to monitor the system. The metrics are disabled by default. To enable the metrics set `metrics.enable = true`. If set to true, all module managed metrics are used, you can configure them one by one via the `metrics` object. The metrics are created in the namespace `GitHub Runners`.

### Supported metrics

- **GitHubAppRateLimitRemaining**: Remaining rate limit for the GitHub App.
- **JobRetry**: Number of job retries, only relevant when job retry is enabled.
- **SpotInterruptionWarning**: Number of spot interruption warnings received by the termination watcher, only relevant when the termination watcher is enabled.

## Debugging

In case the setup does not work as intended, trace the events through this sequence:

- In the GitHub App configuration, the Advanced page displays all webhook events that were sent.
- In AWS CloudWatch, every lambda has a log group. Look at the logs of the `webhook` and `scale-up` lambdas.
- In AWS SQS you can see messages available or in flight.
- Once an EC2 instance is running, you can connect to it in the EC2 user interface using Session Manager (use `enable_ssm_on_runners = true`). Check the user data script using `cat /var/log/user-data.log`. By default several log files of the instances are streamed to AWS CloudWatch, look for a log group named `<environment>/runners`. In the log group you should see at least the log streams for the user data installation and runner agent.
- Registered instances should show up in the Settings - Actions page of the repository or organization (depending on the installation mode).

## Experimental features

### Termination watcher

This feature is in early stage and therefore disabled by default. To enable the watcher, set `instance_termination_watcher.enable = true`.

The termination watcher is currently watching for spot terminations. The module only takes events into account for instances tagged with `ghr:environment` by default, when the module is deployed as part of one of the main modules (root or multi-runner). The module can also be deployed stand-alone, in this case, the tag filter needs to be tuned.

### Termination notification

The watcher is listening for spot termination warnings and creates a log message and optionally a metric. The watcher is disabled by default. The feature is enabled once the watcher is enabled. It can be disabled explicitly by setting `instance_termination_watcher.features.enable_spot_termination_handler = false`.

- Logs: The module will log all termination notifications. For each warning it will look up instance details and log the environment, instance type and time the instance is running, as well as some other details.
- Metrics: Metrics are disabled by default, in order to avoid costs. Once enabled a metric will be created for each warning with at least dimensions for the environment and instance type. The metric name space can be configured via the variables. The metric name used is `SpotInterruptionWarning`.

### Termination handler

!!! warning
This feature will only work once CloudTrail is enabled.

The termination handler is listening for spot terminations by capturing the `BidEvictedEvent` via CloudTrail. The handler will log and optionally create a metric for each termination. The intent is to enhance the logic to inform the user about the termination via the GitHub Job or Workflow run. The feature is disabled by default. The feature is enabled once the watcher is enabled. It can be disabled explicitly by setting `instance_termination_watcher.features.enable_spot_termination_handler = false`.

- Logs: The module will log all termination notifications. For each warning it will look up instance details and log the environment, instance type and time the instance is running, as well as some other details.
- Metrics: Metrics are disabled by default, in order to avoid costs. Once enabled a metric will be created for each termination with at least dimensions for the environment and instance type. THe metric name space can be configured via the variables. The metric name used is `SpotTermination`.

### Log example (both warnings and terminations)

Below is an example of the log messages created.

```
{
    "level": "INFO",
    "message": "Received spot notification for ${metricName}",
    "environment": "default",
    "instanceId": "i-0039b8826b3dcea55",
    "instanceType": "c5.large",
    "instanceLaunchTime": "2024-03-15T08:10:34.000Z",
    "instanceRunningTimeInSeconds": 68,
    "tags": [
        {
            "Key": "ghr:environment",
            "Value": "default"
        }
        ... all tags ...
    ]
}
```

### Dynamic Labels

This feature is in early stage and therefore disabled by default. To enable dynamic labels, set `enable_dynamic_labels = true`.

Dynamic labels allow workflow authors to pass arbitrary metadata and EC2 instance overrides directly from the `runs-on` labels in their GitHub Actions workflows. All labels prefixed with `ghr-` are treated as dynamic labels. A deterministic hash of all `ghr-` prefixed labels is computed and used for runner matching, ensuring that each unique combination of dynamic labels routes to the correct runner configuration.

Dynamic labels serve two purposes:

1. **Custom identity / restriction labels (`ghr-<key>:<value>`)** — Any `ghr-` prefixed label that is *not* `ghr-ec2-` acts as a custom identity label. These can represent a unique job ID, a team name, a cost center, an environment tag, or any arbitrary restriction. They do not affect EC2 configuration but are included in the label hash, guaranteeing unique runner matching per combination.
2. **EC2 override labels (`ghr-ec2-<key>:<value>`)** — Labels prefixed with `ghr-ec2-` are parsed by the scale-up lambda to dynamically configure the EC2 fleet request — including instance type, vCPU/memory requirements, GPU/accelerator specs, EBS volumes, placement, and networking. This eliminates the need to create separate runner configurations for each hardware combination.

#### How it works

When `enable_dynamic_labels` is enabled, the webhook and scale-up lambdas inspect the `runs-on` labels of incoming `workflow_job` events. Labels starting with `ghr-ec2-` are parsed into an EC2 override configuration that is applied to the [CreateFleet](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateFleet.html) API call. All other `ghr-` prefixed labels are carried through as custom identity labels. A deterministic hash of **all** `ghr-` prefixed labels (both custom and EC2) is used to ensure consistent and unique runner matching.

#### Configuration

```hcl
module "runners" {
  source = "github-aws-runners/github-runners/aws"

  ...
  enable_dynamic_labels = true
  ...
}
```

#### Custom identity labels

Any label matching `ghr-<key>:<value>` (where `<key>` does **not** start with `ec2-`) is a custom identity label. These labels have no effect on EC2 instance configuration but are included in the runner matching hash. Use them to:

- Assign a **unique job identity** so each workflow run targets a dedicated runner (e.g., `ghr-job-id:abc123`).
- Apply **team or cost-center restrictions** (e.g., `ghr-team:platform`, `ghr-cost-center:eng-42`).
- Tag runners with **environment or deployment context** (e.g., `ghr-env:staging`, `ghr-region:us-west-2`).
- Enforce **any custom constraint** that differentiates one runner request from another.

```yaml
jobs:
  deploy:
    runs-on:
      - self-hosted
      - linux
      - ghr-team:platform
      - ghr-env:staging
      - ghr-job-id:${{ github.run_id }}
```

In the example above, the three `ghr-` labels produce a unique hash, ensuring this job is matched to a runner created specifically for this combination. No EC2 overrides are applied — the runner uses the default fleet configuration.

#### EC2 override labels

Labels using the format `ghr-ec2-<key>:<value>` override EC2 fleet configuration. Values with multiple items use comma-separated lists.

##### Basic Fleet Overrides

| Label                                        | Description                          | Example value       |
| -------------------------------------------- | ------------------------------------ | ------------------- |
| `ghr-ec2-instance-type:<type>`               | Set specific instance type           | `c5.xlarge`         |
| `ghr-ec2-max-price:<price>`                  | Set maximum spot price               | `0.10`              |
| `ghr-ec2-subnet-id:<id>`                     | Set subnet ID                        | `subnet-abc123`     |
| `ghr-ec2-availability-zone:<zone>`           | Set availability zone                | `us-east-1a`        |
| `ghr-ec2-availability-zone-id:<id>`          | Set availability zone ID             | `use1-az1`          |
| `ghr-ec2-weighted-capacity:<number>`         | Set weighted capacity                | `2`                 |
| `ghr-ec2-priority:<number>`                  | Set launch priority                  | `1`                 |
| `ghr-ec2-image-id:<ami-id>`                  | Override AMI ID                      | `ami-0abcdef123`    |

##### Instance Requirements — vCPU & Memory

| Label                                        | Description                          | Example value       |
| -------------------------------------------- | ------------------------------------ | ------------------- |
| `ghr-ec2-vcpu-count-min:<number>`            | Minimum vCPU count                   | `4`                 |
| `ghr-ec2-vcpu-count-max:<number>`            | Maximum vCPU count                   | `16`                |
| `ghr-ec2-memory-mib-min:<number>`            | Minimum memory in MiB               | `16384`             |
| `ghr-ec2-memory-mib-max:<number>`            | Maximum memory in MiB               | `65536`             |
| `ghr-ec2-memory-gib-per-vcpu-min:<number>`   | Min memory per vCPU ratio (GiB)     | `2`                 |
| `ghr-ec2-memory-gib-per-vcpu-max:<number>`   | Max memory per vCPU ratio (GiB)     | `8`                 |

##### Instance Requirements — CPU & Performance

| Label                                        | Description                                                       | Example value              |
| -------------------------------------------- | ----------------------------------------------------------------- | -------------------------- |
| `ghr-ec2-cpu-manufacturers:<list>`           | CPU manufacturers (comma-separated)                               | `intel,amd`                |
| `ghr-ec2-instance-generations:<list>`        | Instance generations (comma-separated)                            | `current`                  |
| `ghr-ec2-excluded-instance-types:<list>`     | Exclude instance types (comma-separated)                          | `t2.micro,t3.nano`        |
| `ghr-ec2-allowed-instance-types:<list>`      | Allow only specific instance types (comma-separated)              | `c5.xlarge,c5.2xlarge`    |
| `ghr-ec2-burstable-performance:<value>`      | Burstable performance (`included`, `excluded`, `required`)        | `excluded`                 |
| `ghr-ec2-bare-metal:<value>`                 | Bare metal (`included`, `excluded`, `required`)                   | `excluded`                 |

##### Instance Requirements — Accelerators / GPU

| Label                                             | Description                                                              | Example value                    |
| ------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------- |
| `ghr-ec2-accelerator-types:<list>`                | Accelerator types (comma-separated: `gpu`, `fpga`, `inference`)          | `gpu`                            |
| `ghr-ec2-accelerator-count-min:<number>`          | Minimum accelerator count                                                | `1`                              |
| `ghr-ec2-accelerator-count-max:<number>`          | Maximum accelerator count                                                | `4`                              |
| `ghr-ec2-accelerator-manufacturers:<list>`        | Accelerator manufacturers (comma-separated)                              | `nvidia`                         |
| `ghr-ec2-accelerator-names:<list>`                | Specific accelerator names (comma-separated)                             | `t4,v100`                        |
| `ghr-ec2-accelerator-memory-mib-min:<number>`     | Min accelerator total memory in MiB                                      | `8192`                           |
| `ghr-ec2-accelerator-memory-mib-max:<number>`     | Max accelerator total memory in MiB                                      | `32768`                          |

##### Instance Requirements — Network & Storage

| Label                                              | Description                                                       | Example value       |
| -------------------------------------------------- | ----------------------------------------------------------------- | ------------------- |
| `ghr-ec2-network-interface-count-min:<number>`     | Min network interfaces                                            | `1`                 |
| `ghr-ec2-network-interface-count-max:<number>`     | Max network interfaces                                            | `4`                 |
| `ghr-ec2-network-bandwidth-gbps-min:<number>`      | Min network bandwidth in Gbps                                     | `10`                |
| `ghr-ec2-network-bandwidth-gbps-max:<number>`      | Max network bandwidth in Gbps                                     | `25`                |
| `ghr-ec2-local-storage:<value>`                    | Local storage (`included`, `excluded`, `required`)                | `required`          |
| `ghr-ec2-local-storage-types:<list>`               | Local storage types (comma-separated: `hdd`, `ssd`)              | `ssd`               |
| `ghr-ec2-total-local-storage-gb-min:<number>`      | Min total local storage in GB                                     | `100`               |
| `ghr-ec2-total-local-storage-gb-max:<number>`      | Max total local storage in GB                                     | `500`               |
| `ghr-ec2-baseline-ebs-bandwidth-mbps-min:<number>` | Min baseline EBS bandwidth in Mbps                                | `1000`              |
| `ghr-ec2-baseline-ebs-bandwidth-mbps-max:<number>` | Max baseline EBS bandwidth in Mbps                                | `5000`              |

##### Placement

| Label                                                  | Description                                                | Example value         |
| ------------------------------------------------------ | ---------------------------------------------------------- | --------------------- |
| `ghr-ec2-placement-group:<name>`                       | Placement group name                                       | `my-cluster-group`    |
| `ghr-ec2-placement-tenancy:<value>`                    | Tenancy (`default`, `dedicated`, `host`)                   | `dedicated`           |
| `ghr-ec2-placement-host-id:<id>`                       | Dedicated host ID                                          | `h-abc123`            |
| `ghr-ec2-placement-affinity:<value>`                   | Affinity (`default`, `host`)                               | `host`                |
| `ghr-ec2-placement-partition-number:<number>`          | Partition number                                           | `1`                   |
| `ghr-ec2-placement-availability-zone:<zone>`           | Placement availability zone                                | `us-east-1a`          |
| `ghr-ec2-placement-spread-domain:<domain>`             | Spread domain                                              | `my-domain`           |
| `ghr-ec2-placement-host-resource-group-arn:<arn>`      | Host resource group ARN                                    | `arn:aws:...`         |

##### Block Device Mappings (EBS)

| Label                                            | Description                                                    | Example value  |
| ------------------------------------------------ | -------------------------------------------------------------- | -------------- |
| `ghr-ec2-ebs-volume-size:<size>`                 | EBS volume size in GB                                          | `100`          |
| `ghr-ec2-ebs-volume-type:<type>`                 | EBS volume type (`gp2`, `gp3`, `io1`, `io2`, `st1`, `sc1`)   | `gp3`          |
| `ghr-ec2-ebs-iops:<number>`                      | EBS IOPS                                                       | `3000`         |
| `ghr-ec2-ebs-throughput:<number>`                 | EBS throughput in MB/s (gp3 only)                              | `125`          |
| `ghr-ec2-ebs-encrypted:<boolean>`                 | EBS encryption (`true`, `false`)                               | `true`         |
| `ghr-ec2-ebs-kms-key-id:<id>`                    | KMS key ID for encryption                                      | `key-abc123`   |
| `ghr-ec2-ebs-delete-on-termination:<boolean>`     | Delete on termination (`true`, `false`)                        | `true`         |
| `ghr-ec2-ebs-snapshot-id:<id>`                    | Snapshot ID for EBS volume                                     | `snap-abc123`  |
| `ghr-ec2-block-device-virtual-name:<name>`        | Virtual device name (ephemeral storage)                        | `ephemeral0`   |
| `ghr-ec2-block-device-no-device:<string>`         | Suppresses device mapping                                      | `true`         |

##### Pricing & Advanced

| Label                                                                         | Description                                                        | Example value  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------- |
| `ghr-ec2-spot-max-price-percentage-over-lowest-price:<number>`                | Spot max price as % over lowest price                              | `20`           |
| `ghr-ec2-on-demand-max-price-percentage-over-lowest-price:<number>`           | On-demand max price as % over lowest price                         | `10`           |
| `ghr-ec2-max-spot-price-as-percentage-of-optimal-on-demand-price:<number>`    | Max spot price as % of optimal on-demand                           | `50`           |
| `ghr-ec2-require-hibernate-support:<boolean>`                                 | Require hibernate support (`true`, `false`)                        | `true`         |
| `ghr-ec2-require-encryption-in-transit:<boolean>`                             | Require encryption in-transit (`true`, `false`)                    | `true`         |
| `ghr-ec2-baseline-performance-factors-cpu-reference-families:<list>`          | CPU baseline performance reference families (comma-separated)      | `c5,m5`        |

#### Examples

Custom identity labels only — unique runner per job run:

```yaml
jobs:
  deploy:
    runs-on:
      - self-hosted
      - linux
      - ghr-job-id:${{ github.run_id }}
```

Specific instance type with a larger EBS volume:

```yaml
jobs:
  build:
    runs-on:
      - self-hosted
      - linux
      - ghr-ec2-instance-type:c5.2xlarge
      - ghr-ec2-ebs-volume-size:200
      - ghr-ec2-ebs-volume-type:gp3
```

Attribute-based instance selection with Intel CPUs only:

```yaml
jobs:
  test:
    runs-on:
      - self-hosted
      - linux
      - ghr-ec2-vcpu-count-min:2
      - ghr-ec2-vcpu-count-max:8
      - ghr-ec2-memory-mib-min:8192
      - ghr-ec2-cpu-manufacturers:intel
      - ghr-ec2-burstable-performance:excluded
```

#### Considerations

- This feature requires `enable_dynamic_labels = true` in your Terraform configuration.
- When using `ghr-ec2-instance-type`, the fleet request uses a direct instance type override. When using `ghr-ec2-vcpu-count-*`, `ghr-ec2-memory-mib-*`, or other instance requirement labels, the fleet request uses [attribute-based instance type selection](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-fleet-attribute-based-instance-type-selection.html).
- Labels are parsed at the scale-up lambda level — they do not change after the instance is launched.
- A deterministic hash of all `ghr-` prefixed labels (both custom identity and EC2 override) is used for runner matching. Different label combinations produce different hashes, ensuring each unique set of requirements gets its own runner.
- Custom `ghr-` labels (non-`ec2`) are free-form — you can use any key/value pair. They are not validated by the module.
- Multiple EBS labels apply to the same (first) block device mapping. If you need more complex block device configurations, use a custom AMI or launch template instead.
- This feature is compatible with both org-level and repo-level runners, spot and on-demand instances, and ephemeral and non-ephemeral runners.
- Be mindful of the security implications: enabling this feature allows workflow authors to influence EC2 instance configuration via `ghr-ec2-` labels. Ensure your IAM policies and subnet configurations provide appropriate guardrails.

### EventBridge

This module can be deployed in `EventBridge` mode. The `EventBridge` mode will publish an event to an eventbus. Within the eventbus, there is a target rule set, sending events to the dispatch lambda. The `EventBridge` mode is enabled by default.

Example to extend the EventBridge:

```hcl

module "runners" {
  source = "github-aws-runners/github-runners/aws"

  ...
  eventbridge = {
    enable = false
  }
  ...
}

locals {
  event_bus_name = module.runners.webhook.eventbridge.event_bus.name
}

resource "aws_cloudwatch_event_rule" "example" {
  name           = "${local.prefix}-github-events-all"
  description    = "Capture all GitHub events"
  event_bus_name = local.event_bus_name
  event_pattern  = <<EOF
{
  "source": [{
    "prefix": "github"
  }]
}
EOF
}

resource "aws_cloudwatch_event_target" "main" {
  rule           = aws_cloudwatch_event_rule.example.name
  arn            = <arn of target>
  event_bus_name = local.event_bus_name
  role_arn       = aws_iam_role.event_rule_firehose_role.arn
}

data "aws_iam_policy_document" "event_rule_firehose_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "event_rule_role" {
  name               = "${local.prefix}-eventbridge-github-rule"
  assume_role_policy = data.aws_iam_policy_document.event_rule_firehose_role.json
}

data aws_iam_policy_document firehose_stream {
  statement {
    INSERT_YOUR_POLICY_HERE_TO_ACCESS_THE_TARGET
  }
}

resource "aws_iam_role_policy" "event_rule_firehose_role" {
  name = "target-event-rule-firehose"
  role = aws_iam_role.event_rule_firehose_role.name
  policy = data.aws_iam_policy_document.firehose_stream.json
}
```
