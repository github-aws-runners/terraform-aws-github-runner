# Configuration

## Configuration considerations

To be able to support a number of use-cases, the module has quite a lot of configuration options. We tried to choose reasonable defaults. Several examples also show the main cases of how to configure the runners.

- Org vs Repo level. You can configure the module to connect the runners in GitHub on an org level and share the runners in your org, or set the runners on repo level and the module will install the runner to the repo. There can be multiple repos but runners are not shared between repos.
- Multi-Runner module. This modules allows you to create multiple runner configurations with a single webhook and single GitHub App to simplify deployment of different types of runners. Check the detailed module [documentation](modules/public/multi-runner.md) for more information or checkout the [multi-runner example](examples/multi-runner.md).
- Workflow job event. You can configure the webhook in GitHub to send workflow job events to the webhook. Workflow job events were introduced by GitHub in September 2021 and are designed to support scalable runners. We advise using the workflow job event when possible.
- Linux vs Windows. You can configure the OS types linux and win. Linux will be used by default.
- Re-use vs Ephemeral. By default runners are re-used, until detected idle. Once idle they will be removed from the pool. To improve security we are introducing ephemeral runners. Those runners are only used for one job. Ephemeral runners only work in combination with the workflow job event. For ephemeral runners the lambda requests a JIT (just in time) configuration via the GitHub API to register the runner. [JIT configuration](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-just-in-time-runners) is limited to ephemeral runners (and currently not supported by GHES). For non-ephemeral runners, a registration token is always requested. In both cases the configuration is made available to the instance via the same SSM parameter. To disable JIT configuration for ephemeral runners set `enable_jit_config` to `false`. We also suggest using a pre-build AMI to improve the start time of jobs for ephemeral runners.
- Job retry (**Beta**). By default the scale-up lambda will discard the message when it is handled. Meaning in the ephemeral use-case an instance is created. The created runner will ask GitHub for a job, no guarantee it will run the job for which it was scaling. Result could be that with small system hick-up the job is keeping waiting for a runner. Enable a pool (org runners) is one option to avoid this problem. Another option is to enable the job retry function. Which will retry the job after a delay for a configured number of times.
- GitHub Cloud vs GitHub Enterprise Server (GHES). The runners support GitHub Cloud as well GitHub Enterprise Server. For GHES, we rely on our community for support and testing. We at Philips have no capability to test GHES ourselves.
- Spot vs on-demand. The runners use either the EC2 spot or on-demand life cycle. Runners will be created via the AWS [CreateFleet API](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateFleet.html). The module (scale up lambda) will request via the CreateFleet API to create instances in one of the subnets and of the specified instance types.
- ARM64 support via Graviton/Graviton2 instance-types. When using the default example or top-level module, specifying `instance_types` that match a Graviton/Graviton 2 (ARM64) architecture (e.g. a1, t4g or any 6th-gen `g` or `gd` type), you must also specify `runner_architecture = "arm64"` and the sub-modules will be automatically configured to provision with ARM64 AMIs and leverage GitHub's ARM64 action runner. See below for more details.

## AWS SSM Parameters

The module uses the AWS System Manager Parameter Store to store configuration for the runners, as well as registration tokens and secrets for the Lambdas. Paths for the parameters can be configured via the variable `ssm_paths`. The location of the configuration parameters is retrieved by the runners via the instance tag `ghr:ssm_config_path`. The following default paths will be used. Tokens or JIT config stored in the token path will be deleted after retrieval by instance, data not deleted after a day will be deleted by a SSM housekeeper lambda.

| Path                                                          | Description                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ssm_paths.root/var.prefix?/app/`                             | App secrets used by Lambda's                                                                                                                                                                                                    |
| `ssm_paths.root/var.prefix?/runners/config/<name>`            | Configuration parameters used by runner start script                                                                                                                                                                            |
| `ssm_paths.root/var.prefix?/runners/tokens/<ec2-instance-id>` | Either JIT configuration (ephemeral runners) or registration tokens (non ephemeral runners) generated by the control plane (scale-up lambda), and consumed by the start script on the runner to activate / register the runner. |
| `ssm_paths.root/var.prefix?/webhook/runner-matcher-config`                             | Runner matcher config used by webhook to decide the target for the webhook event.                                                                                                                                                                                                    |
Available configuration parameters:

| Parameter name      | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `agent_mode`        | Indicates if the agent is running in ephemeral mode or not. |
| `enable_cloudwatch` | Configuration for the cloudwatch agent to stream logging.   |
| `run_as`            | The user used for running the GitHub action runner agent.   |
| `token_path`        | The path where tokens are stored.                           |

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
- To ensure runners are created in the same order GitHub sends the events, by default we use a FIFO queue. This is mainly relevant for repo level runners. For ephemeral runners you can set `enable_fifo_build_queue` to `false`.
- Errors related to scaling should be retried via SQS. You can configure `job_queue_retention_in_seconds` and `redrive_build_queue` to tune the behavior. We have no mechanism to avoid events never being processed, which means potentially no runner gets created and the job in GitHub times out in 6 hours.

The example for [ephemeral runners](examples/ephemeral.md) is based on the [default example](examples/default.md). Have look at the diff to see the major configuration differences.


## Job retry (**Beta**)

You can enable the job retry function to retry a job after a delay for a configured number of times. The function is disabled by default. To enable the function set `job_retry.enable` to `true`. The function will check the job status after a delay, and when the is still queued, it will create a new runner. The new runner is created in the same way as the others via the scale-up function. Hence the same configuration applies.

For checking the job status a API call is made to GitHub. Which can exhaust the GitHub API more quickly for larger deployments and cause rate limits. For larger deployment with a lot of frequent jobs having a small pool available could be a better choice.

The option `job_retry.delay_in_seconds` is the delay before the job status is checked. The delay is increased by the factor `job_retry.delay_backoff` for each attempt. The upper bound for a delay is 900 seconds, which is the max message delay on SQS. The maximum number of attempts is configured via `job_retry.max_attempts`. The delay should be set to a higher value than the time it takes to start a runner.


## Prebuilt Images

This module also allows you to run agents from a prebuilt AMI to gain faster startup times. The module provides several examples to build your own custom AMI. To remove old images, an [AMI housekeeper module](modules/public/ami-housekeeper.md) can be used. See the [AMI examples](ami-examples/index.md) for more details.

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
- Traces for Github API calls (can be configured by capture_http_requests).
- Traces for all AWS SDK calls

This feature has been disabled by default.

### Multiple runner module in your AWS account

The watcher will act on all spot termination notificatins and log all onses relevant to the runner module. Therefor we suggest to only deploy the watcher once. You can either deploy the watcher by enabling in one of your deployments or deploy the watcher as a stand alone module.

## Metrics

The module supports metrics (experimental feature) to monitor the system. The metrics are disabled by default. To enable the metrics set `metrics.enable = true`. If set to true, all module managed metrics are used, you can configure the one by one via the `metrics` object. The metrics are created in the namespace `GitHub Runners`.

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

This feature is in early stage and therefore disabled by default.

The termination watcher is currently watching for spot termination notifications. The module is only taken events into account for instances tagged with `ghr:environment` by default when deployment the module as part of one of the main modules (root or multi-runner). The module can also be deployed stand-alone, in that case the tag filter needs to be tunned.

- Logs: The module will log all termination notifications. For each warning it will look up instance details and log the environment, instance type and time the instance is running. As well some other details.
- Metrics: Metrics are disabled by default, this to avoid costs. Once enabled a metric will be created for each warning with at least dimensions for the environment and instance type. THe metric name space can be configured via the variables. The metric name used is `SpotInterruptionWarning`.

#### Log example

Below an example of the the log messages created.

```
{
    "level": "INFO",
    "message": "Received spot notification warning:",
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

### Queue to publish workflow job events

This queue is an experimental feature to allow you to receive a copy of the wokflow_jobs events sent by the GitHub App. This can be used to calculate a matrix or monitor the system.

To enable the feature set `enable_workflow_job_events_queue = true`. Be aware though, this feature is experimental!

Messages received on the queue are using the same format as published by GitHub wrapped in a property `workflowJobEvent`.

```
export interface GithubWorkflowEvent {
  workflowJobEvent: WorkflowJobEvent;
}
```

This extensible format allows more fields to be added if needed.
You can configure the queue by setting properties to `workflow_job_events_queue_config`

NOTE: By default, a runner AMI update requires a re-apply of this terraform config (the runner AMI ID is looked up by a terraform data source). To avoid this, you can use `ami_id_ssm_parameter_name` to have the scale-up lambda dynamically lookup the runner AMI ID from an SSM parameter at instance launch time. Said SSM parameter is managed outside of this module (e.g. by a runner AMI build workflow).
