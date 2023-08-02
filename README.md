# Terraform module for scalable self hosted GitHub action runners <!-- omit in toc -->

[![awesome-runners](https://img.shields.io/badge/listed%20on-awesome--runners-blue.svg)](https://github.com/jonico/awesome-runners)[![Terraform registry](https://img.shields.io/github/v/release/philips-labs/terraform-aws-github-runner?label=Terraform%20Registry)](https://registry.terraform.io/modules/philips-labs/github-runner/aws/) [![Terraform checks](https://github.com/philips-labs/terraform-aws-github-runner/actions/workflows/terraform.yml/badge.svg)](https://github.com/philips-labs/terraform-aws-github-runner/actions/workflows/terraform.yml) [![Lambdas](https://github.com/philips-labs/terraform-aws-github-runner/actions/workflows/lambda.yml/badge.svg)](https://github.com/philips-labs/terraform-aws-github-runner/actions/workflows/lambda.yml)

This [Terraform](https://www.terraform.io/) module creates the required infrastructure needed to host [GitHub Actions](https://github.com/features/actions) self-hosted, auto-scaling runners on [AWS spot instances](https://aws.amazon.com/ec2/spot/). It provides the required logic to handle the life cycle for scaling up and down using a set of AWS Lambda functions. Runners are scaled down to zero to avoid costs when no workflows are active.

> 📢 [`v3`](https://github.com/philips-labs/terraform-aws-github-runner/pull/3037) underlying logging framework is replaced by [AWS Lambda Powertools](https://awslabs.github.io/aws-lambda-powertools-typescript/latest/). Depending on how you handle the logging of the module a migration could be required.

> 📢 [`v2`](https://github.com/philips-labs/terraform-aws-github-runner/issues/2517) adds the option to create multiple runners at once, via a Terraform [submodule](./modules/multi-runner/README.md). The webhook will deliver events to dedicated runner queues based on matching rules. Next, for each queue, a scaling lambda will ensure the specific runner is created. For more details checkout the [examples](./examples/multi-runner/README.md).

> 📢 `v1` is available on a dedicated branch. The default branch `main` is related to `v2`, for fixes or backports you can submit a PR to the branch `v1`. For feature PR's we will ask you to at least submit a PR to `main`

> 📢 The `main` branch is the new default branch, we will not merge PR's back to `develop`. Please update and rebase your PR to `main` for `v2`, or to the branch `v1` for `v1`.

> 📢 HELP WANTED: We have been running the AWS self-hosted GitHub runners OS project in Philips Labs for over two years! And we are incredibly happy with all the feedback and contribution of the open-source community. In the next months we will speak at some conferences to share the solution and story of running this open-source project. Via [this questionaire](https://forms.office.com/r/j03CUzdLFp) we would like to gather  feedback from the community to use in our talks.

- [Motivation](#motivation)
- [Overview](#overview)
  - [Major configuration options.](#major-configuration-options)
  - [AWS SSM Parameters](#aws-ssm-parameters)
- [Usages](#usages)
  - [Setup GitHub App (part 1)](#setup-github-app-part-1)
  - [Setup terraform module](#setup-terraform-module)
  - [Setup the webhook / GitHub App (part 2)](#setup-the-webhook--github-app-part-2)
    - [Option 1: Webhook](#option-1-webhook)
    - [Option 2: App](#option-2-app)
    - [Install app](#install-app)
  - [Encryption](#encryption)
  - [Pool](#pool)
  - [Idle runners](#idle-runners)
  - [Ephemeral runners](#ephemeral-runners)
  - [Prebuilt Images](#prebuilt-images)
  - [Experimental - Optional queue to publish GitHub workflow job events](#experimental---optional-queue-to-publish-github-workflow-job-events)
- [Examples](#examples)
- [Sub modules](#sub-modules)
- [Logging](#logging)
- [Debugging](#debugging)
- [Security Considerations](#security-considerations)
- [Requirements](#requirements)
- [Providers](#providers)
- [Modules](#modules)
- [Resources](#resources)
- [Inputs](#inputs)
- [Outputs](#outputs)
- [Contributing](#contributing)
- [Philips Forest](#philips-forest)

## Motivation

GitHub Actions `self-hosted` runners provide a flexible option to run CI workloads on the infrastructure of your choice. Currently, no option is provided to automate the creation and scaling of action runners. This module creates the AWS infrastructure to host action runners on spot instances. It provides lambda modules to orchestrate the life cycle of the action runners.

Lambda is chosen as the runtime for two major reasons. First, it allows the creation of small components with minimal access to AWS and GitHub. Secondly, it provides a scalable setup with minimal costs that works on repo level and scales to organization level. The lambdas will create Linux based EC2 instances with Docker to serve CI workloads that can run on Linux and/or Docker. The main goal is to support Docker-based workloads.

A logical question would be, why not Kubernetes? In the current approach, we stay close to how the GitHub action runners are implemented today. The approach is to install the runner on a host where the required software is available. With this setup, we stay quite close to the current GitHub approach. Another logical choice would be AWS Auto Scaling groups. However, this choice would typically require much more permissions at the instance level to GitHub. And besides that, scaling up and down is not trivial.

## Overview

The moment a GitHub action workflow requiring a `self-hosted` runner is triggered, GitHub will try to find a runner which can execute the workload. This module reacts to GitHub's [`workflow_job` event](https://docs.github.com/en/free-pro-team@latest/developers/webhooks-and-events/webhook-events-and-payloads#workflow_job) for the triggered workflow and creates a new runner if necessary.

For receiving the `workflow_job` event by the webhook (lambda), a webhook needs to be created in GitHub. The `check_run` option was dropped from version 2.x. The following options to send the event are supported.

- Create a GitHub app, define a webhook and subscribe the app to the `workflow_job` event.
- Create a webhook on enterprise, org or repo level, define a webhook and subscribe the app to the `workflow_job` event.

In AWS an [API gateway](https://docs.aws.amazon.com/apigateway/index.html) endpoint is created that is able to receive the GitHub webhook events via HTTP post. The gateway triggers the webhook lambda which will verify the signature of the event. This check guarantees the event is sent by the GitHub App. The lambda only handles `workflow_job` events with status `queued` and matching the runner labels. The accepted events are posted on a SQS queue. Messages on this queue will be delayed for a configurable amount of seconds (default 30 seconds) to give the available runners time to pick up this build.

The "scale up runner" lambda listens to the SQS queue and picks up events. The lambda runs various checks to decide whether a new EC2 spot instance needs to be created. For example, the instance is not created if the build is already started by an existing runner, or the maximum number of runners is reached.

The Lambda first requests a JIT configuration or registration token from GitHub, which is needed later by the runner to register itself. This avoids the case that the EC2 instance, which later in the process will install the agent, needs administration permissions to register the runner. Next, the EC2 spot instance is created via the launch template. The launch template defines the specifications of the required instance and contains a [`user_data`](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html) script. This script will install the required software and configure it. The registration token for the action runner is stored in the parameter store (SSM), from which the user data script will fetch it and delete it once it has been retrieved. Once the user data script is finished, the action runner should be online, and the workflow will start in seconds.

Scaling down the runners is at the moment brute-forced, every configurable amount of minutes a lambda will check every runner (instance) if it is busy. In case the runner is not busy it will be removed from GitHub and the instance terminated in AWS. At the moment there seems to be no other option to scale down more smoothly.

Downloading the GitHub Action Runner distribution can occasionally be slow (more than 10 minutes). Therefore a lambda is introduced that synchronizes the action runner binary from GitHub to an S3 bucket. The EC2 instance will fetch the distribution from the S3 bucket instead of the internet.

Secrets and private keys are stored in SSM Parameter Store. These values are encrypted using the default KMS key for SSM or passing in a custom KMS key.

![Architecture](docs/component-overview.svg)

Permission are managed in several places. Below are the most important ones. For details check the Terraform sources.

- The GitHub App requires access to actions and to publish `workflow_job` events to the AWS webhook (API gateway).
- The scale up lambda should have access to EC2 for creating and tagging instances.
- The scale down lambda should have access to EC2 to terminate instances.

Besides these permissions, the lambdas also need permission to CloudWatch (for logging and scheduling), SSM and S3. For more details about the required permissions see the [documentation](./modules/setup-iam-permissions/README.md) of the IAM module which uses permission boundaries.

### Major configuration options.

To be able to support a number of use-cases the module has quite a lot of configuration options. We try to choose reasonable defaults. Several examples also show the main cases of how to configure the runners.

- Org vs Repo level. You can configure the module to connect the runners in GitHub on an org level and share the runners in your org. Or set the runners on repo level and the module will install the runner to the repo. There can be multiple repos but runners are not shared between repos.
- Multi-Runner module. This modules allows you to create multiple runner configurations with a single webhook and single GitHub App to simplify deployment of different types of runners. Refer to the [ReadMe](.modules/../modules/multi-runner/README.md) for more information to understand the functionality.
- Workflow job event. You can configure the webhook in GitHub to send workflow job events to the webhook. Workflow job events were introduced by GitHub in September 2021 and are designed to support scalable runners. We advise using the workflow job event when possible.
- Linux vs Windows. You can configure the OS types linux and win. Linux will be used by default.
- Re-use vs Ephemeral. By default runners are re-used, until detected idle. Once idle they will be removed from the pool. To improve security we are introducing ephemeral runners. Those runners are only used for one job. Ephemeral runners are only working in combination with the workflow job event. For ephemeral runners the lambda requests a JIT (just in time) configuration via the GitHub API to register the runner. [JIT configuration](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-just-in-time-runners) is limited to ephemeral runners (and currently not supported by GHES). For non-ephemeral a registration token is requested always. In both cases the configuration is made available to the instance via the same SSM parameter. To disable JIT configuration for ephermeral runners set `enable_jit_config` to `false`. We also suggest using a pre-build AMI to improve the start time of jobs for ephemeral runners.
- GitHub Cloud vs GitHub Enterprise Server (GHES). The runners support GitHub Cloud as well GitHub Enterprise Server. For GHES we rely on our community for support and testing. We have no possibility to test ourselves on GHES.
- Spot vs on-demand. The runners use either the EC2 spot or on-demand life cycle. Runners will be created via the AWS [CreateFleet API](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateFleet.html). The module (scale up lambda) will request via the CreateFleet API to create instances in one of the subnets and of the specified instance types.
- ARM64 support via Graviton/Graviton2 instance-types. When using the default example or top-level module, specifying `instance_types` that match a Graviton/Graviton 2 (ARM64) architecture (e.g. a1, t4g or any 6th-gen `g` or `gd` type), you must also specify `runner_architecture = "arm64"` and the sub-modules will be automatically configured to provision with ARM64 AMIs and leverage GitHub's ARM64 action runner. See below for more details.

### AWS SSM Parameters

The module uses the AWS System Manager Parameter Store to store configuration for the runners, as well as registration tokens and secrets for the Lambdas. Paths for the parameters can be configured via the variable `ssm_paths`. The location of the configuration parameters is retrieved by the runners via the instance tag `ghr:ssm_config_path`. The following default paths will be used.

| Path      | Description |
| ----------- | ----------- |
| `ssm_paths.root/var.prefix?/app/`     | App secrets used by Lambda's       |
| `ssm_paths.root/var.prefix?/runners/config/<name>`     | Configuration parameters used by runner start script       |
| `ssm_paths.root/var.prefix?/runners/tokens/<ec2-instance-id>` | Either JIT configuration (ephemeral runners) or registration tokens (non ephemeral runners) generated by the control plane (scale-up lambda), and consumed by the start script on the runner to activate / register the runner.

Available configuration parameters:

| Parameter name      | Description |
| ----------- | ----------- |
| `agent_mode` | Indicates if the agent is running in ephemeral mode or not. |
| `enable_cloudwatch` | Configuration for the cloudwatch agent to stream logging. |
| `run_as` | The user used for running the GitHub action runner agent. |
| `token_path` | The path where tokens are stored. |


## Usages

Examples are provided in [the example directory](examples/). Please ensure you have installed the following tools.

- Terraform, or [tfenv](https://github.com/tfutils/tfenv).
- Bash shell or compatible
- Docker (optional, to build lambdas without node).
- AWS cli (optional)
- Node and yarn (for lambda development).

The module supports two main scenarios for creating runners. Repository level runners will be dedicated to only one repository, no other repository can use the runner. At the organization level you can use the runner(s) for all repositories within the organization. See [GitHub self-hosted runner instructions](https://help.github.com/en/actions/hosting-your-own-runners/about-self-hosted-runners) for more information. Before starting the deployment you have to choose one option.

The setup consists of running Terraform to create all AWS resources and manually configuring the GitHub App. The Terraform module requires configuration from the GitHub App and the GitHub app requires output from Terraform. Therefore you first create the GitHub App and configure the basics, then run Terraform, and afterwards finalize the configuration of the GitHub App.

### Setup GitHub App (part 1)

Go to GitHub and [create a new app](https://docs.github.com/en/developers/apps/creating-a-github-app). Be aware you can create apps for your organization or for a user. For now we only support organization level apps.

1. Create an app in Github
2. Choose a name
3. Choose a website (mandatory, not required for the module).
4. Disable the webhook for now (we will configure this later or create an alternative webhook).
5. Permissions for all runners:
    - Repository:
      - `Actions`: Read-only (check for queued jobs)
      - `Checks`: Read-only (receive events for new builds)
      - `Metadata`: Read-only (default/required)
6. _Permissions for repo level runners only_:
   - Repository:
     - `Administration`: Read & write (to register runner)
7. _Permissions for organization level runners only_:
   - Organization
     - `Self-hosted runners`: Read & write (to register runner)
8. Save the new app.
9. On the General page, make a note of the "App ID" and "Client ID" parameters.
10. Generate a new private key and save the `app.private-key.pem` file.

### Setup terraform module

#### Download lambdas <!-- omit in toc -->

To apply the terraform module, the compiled lambdas (.zip files) need to be available either locally or in an S3 bucket. They can either be downloaded from the GitHub release page or built locally.

To read the files from S3, set the `lambda_s3_bucket` variable and the specific object key for each lambda.

The lambdas can be downloaded manually from the [release page](https://github.com/philips-labs/terraform-aws-github-runner/releases) or using the [download-lambda](./modules/download-lambda) terraform module (requires `curl` to be installed on your machine). In the `download-lambda` directory, run `terraform init && terraform apply`. The lambdas will be saved to the same directory.

For local development you can build all the lambdas at once using `.ci/build.sh` or individually using `yarn dist`.

#### Service-linked role <!-- omit in toc -->

To create spot instances the `AWSServiceRoleForEC2Spot` role needs to be added to your account. You can do that manually by following the [AWS docs](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-requests.html#service-linked-roles-spot-instance-requests). To use terraform for creating the role, either add the following resource or let the module manage the service linked role by setting `create_service_linked_role_spot` to `true`. Be aware this is an account global role, so maybe you don't want to manage it via a specific deployment.

```hcl
resource "aws_iam_service_linked_role" "spot" {
  aws_service_name = "spot.amazonaws.com"
}
```

#### Terraform module <!-- omit in toc -->

Next create a second terraform workspace and initiate the module, or adapt one of the [examples](./examples).

Note that `github_app.key_base64` needs to be a base64-encoded string of the `.pem` file i.e. the output of `base64 app.private-key.pem`. The decoded string can either be a multiline value or a single line value with new lines represented with literal `\n` characters.

```hcl
module "github-runner" {
  source  = "philips-labs/github-runner/aws"
  version = "REPLACE_WITH_VERSION"

  aws_region = "eu-west-1"
  vpc_id     = "vpc-123"
  subnet_ids = ["subnet-123", "subnet-456"]

  prefix = "gh-ci"

  github_app = {
    key_base64     = "base64string"
    id             = "1"
    webhook_secret = "webhook_secret"
  }

  webhook_lambda_zip                = "lambdas-download/webhook.zip"
  runner_binaries_syncer_lambda_zip = "lambdas-download/runner-binaries-syncer.zip"
  runners_lambda_zip                = "lambdas-download/runners.zip"
  enable_organization_runners = true
}
```

Run terraform by using the following commands

```bash
terraform init
terraform apply
```

The terraform output displays the API gateway url (endpoint) and secret, which you need in the next step.

The lambda for syncing the GitHub distribution to S3 is triggered via CloudWatch (by default once per hour). After deployment the function is triggered via S3 to ensure the distribution is cached.

### Setup the webhook / GitHub App (part 2)

At this point you have two options. Either create a separate webhook (enterprise,
org, or repo), or create a webhook in the App.

#### Option 1: Webhook

1. Create a new webhook at the repo level for repo level runners, or org (or enterprise level) for org level runners.
2. Provide the webhook url, which should be part of the output of terraform.
3. Provide the webhook secret (`terraform output -raw <NAME_OUTPUT_VAR>`).
4. Ensure the content type is `application/json`.
5. In the "Permissions & Events" section and then "Subscribe to Events" subsection, check either "Workflow Job" or "Check Run" (choose only one option!!!).
6. In the "Install App" section, install the App in your organization, either in all or in selected repositories.

#### Option 2: App

Go back to the GitHub App and update the following settings.

1. Enable the webhook.
2. Provide the webhook url, should be part of the output of terraform.
3. Provide the webhook secret (`terraform output -raw <NAME_OUTPUT_VAR>`).
4. In the "Permissions & Events" section and then "Subscribe to Events" subsection, check either "Workflow Job" or "Check Run" (choose only one option!!!).

#### Install app

Finally you need to ensure the app is installed to all or selected repositories.

Go back to the GitHub App and update the following settings.

1. In the "Install App" section, install the App in your organization, either in all or in selected repositories.

### Encryption

The module supports two scenarios to manage environment secrets and private keys of the Lambda functions.

#### Encrypted via a module managed KMS key (default) <!-- omit in toc -->

This is the default, no additional configuration is required.

#### Encrypted via a provided KMS key <!-- omit in toc -->

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

### Pool

The module basically supports two options for keeping a pool of runners. One is via a pool which only supports org-level runners, the second option is [keeping runners idle](#idle-runners).

The pool is introduced in combination with the ephemeral runners and is primarily meant to ensure if any event is unexpectedly dropped and no runner was created the pool can pick up the job. The pool is maintained by a lambda. Each time the lambda is triggered a check is performed if the number of idle runners managed by the module is meeting the expected pool size. If not, the pool will be adjusted. Keep in mind that the scale down function is still active and will terminate instances that are detected as idle.

```hcl
pool_runner_owner = "my-org"                  # Org to which the runners are added
pool_config = [{
  size                = 20                    # size of the pool
  schedule_expression = "cron(* * * * ? *)"   # cron expression to trigger the adjustment of the pool
}]
```

The pool is NOT enabled by default and can be enabled by setting at least one object of the pool config list. The [ephemeral example](./examples/ephemeral/README.md) contains configuration options (commented out).

### Idle runners

The module will scale down to zero runners by default. By specifying a `idle_config` config, idle runners can be kept active. The scale down lambda checks if any of the cron expressions matches the current time with a margin of 5 seconds. When there is a match, the number of runners specified in the idle config will be kept active. In case multiple cron expressions matches, only the first one is taken into account. Below is an idle configuration for keeping runners active from 9:00am to 5:59pm on working days. The [cron expression generator by Cronhub](https://crontab.cronhub.io/) is a great resource to set up your idle config.

```hcl
idle_config = [{
   cron      = "* * 9-17 * * 1-5"
   timeZone  = "Europe/Amsterdam"
   idleCount = 2
}]
```

_**Note**_: When using Windows runners it's recommended to keep a few runners warmed up due to the minutes-long cold start time.


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

### Ephemeral runners

You can configure runners to be ephemeral, runners will be used only for one job. The feature should be used in conjunction with listening for the workflow job event. Please consider the following:

- The scale down lambda is still active, and should only remove orphan instances. But there is no strict check in place. So ensure you configure the `minimum_running_time_in_minutes` to a value that is high enough to get your runner booted and connected to avoid it being terminated before executing a job.
- The messages sent from the webhook lambda to the scale-up lambda are by default delayed by SQS, to give available runners a chance to start the job before the decision is made to scale more runners. For ephemeral runners there is no need to wait. Set `delay_webhook_event` to `0`.
- All events in the queue will lead to a new runner created by the lambda. By setting `enable_job_queued_check` to `true` you can enforce a rule of only creating a runner if the event has a correlated queued job. Setting this can avoid creating useless runners, for example when jobs got cancelled before a runner was created or if the job was already picked up by another runner. We suggest using this in combination with a pool.
- To ensure runners are created in the same order GitHub sends the events, by default we use a FIFO queue. This is mainly relevant for repo level runners. For ephemeral runners you can set `enable_fifo_build_queue` to `false`.
- Errors related to scaling should be retried via SQS. You can configure `job_queue_retention_in_seconds` and `redrive_build_queue` to tune the behavior. We have no mechanism to avoid events never being processed, which means potentially no runner gets created and the job in GitHub times out in 6 hours.

The example for [ephemeral runners](./examples/ephemeral) is based on the [default example](./examples/default). Have look at the diff to see the major configuration differences.

### Prebuilt Images

This module also allows you to run agents from a prebuilt AMI to gain faster startup times. You can find more information in [the image README.md](/images/README.md)

### Experimental - Optional queue to publish GitHub workflow job events

This queue is an experimental feature to allow you to receive a copy of the wokflow_jobs events sent by the GItHub App. For example to calculate a matrix or monitor the system.

To enable the feature set `enable_workflow_job_events_queue = true`. Be aware the feature in experimental!

Messages received on the queue are using the same format as published by GitHub wrapped in a property `workflowJobEvent`.

```
export interface GithubWorkflowEvent {
  workflowJobEvent: WorkflowJobEvent;
}
```
This extendible format allows more fields to be added if needed.
You can configure the queue by setting properties to `workflow_job_events_queue_config`

NOTE: By default, a runner AMI update requires a re-apply of this terraform config (the runner AMI ID is looked up by a terraform data source). To avoid this, you can use `ami_id_ssm_parameter_name` to have the scale-up lambda dynamically lookup the runner AMI ID from an SSM parameter at instance launch time. Said SSM parameter is managed outside of this module (e.g. by a runner AMI build workflow).

## Examples

Examples are located in the [examples](./examples) directory. The following examples are provided:

- _[Default](examples/default/README.md)_: The default example of the module
- _[ARM64](examples/arm64/README.md)_: Example usage with ARM64 architecture
- _[Ephemeral](examples/ephemeral/README.md)_: Example usages of ephemeral runners based on the default example.
- _[Multi Runner](examples/multi-runner/README.md)_ : Example usage of creating a multi runner which creates multiple runners/ configurations with a single deployment
- _[Permissions boundary](examples/permissions-boundary/README.md)_: Example usages of permissions boundaries.
- _[Prebuilt Images](examples/prebuilt/README.md)_: Example usages of deploying runners with a custom prebuilt image.
- _[Ubuntu](examples/ubuntu/README.md)_: Example usage of creating a runner using Ubuntu AMIs.
- _[Windows](examples/windows/README.md)_: Example usage of creating a runner using Windows as the OS.


## Sub modules

The module contains several submodules, you can use the module via the main module or assemble your own setup by initializing the submodules yourself.

The following submodules are the core of the module and are mandatory:

- _[runner-binaries-syncer](./modules/runner-binaries-syncer/README.md)_ - Syncs the action runner distribution.
- _[runners](./modules/runners/README.md)_ - Scales the action runners up and down
- _[webhook](./modules/webhook/README.md)_ - Handles GitHub webhooks
- _[multi-runner](./modules/multi-runner/README.md)_ - Creates multiple runner configurations in a single deployment

The following sub modules are optional and are provided as examples or utilities:

- _[download-lambda](./modules/download-lambda/README.md)_ - Utility module to download lambda artifacts from GitHub Release
- _[setup-iam-permissions](./modules/setup-iam-permissions/README.md)_ - Example module to setup permission boundaries

ARM64 configuration for submodules. When using the top level module configure `runner_architecture = "arm64"` and ensure the list of `instance_types` matches. When not using the top-level, ensure these properties are set on the submodules.

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

## Debugging

In case the setup does not work as intended follow the trace of events:

- In the GitHub App configuration, the Advanced page displays all webhook events that were sent.
- In AWS CloudWatch, every lambda has a log group. Look at the logs of the `webhook` and `scale-up` lambdas.
- In AWS SQS you can see messages available or in flight.
- Once an EC2 instance is running, you can connect to it in the EC2 user interface using Session Manager (use `enable_ssm_on_runners = true`). Check the user data script using `cat /var/log/user-data.log`. By default several log files of the instances are streamed to AWS CloudWatch, look for a log group named `<environment>/runners`. In the log group you should see at least the log streams for the user data installation and runner agent.
- Registered instances should show up in the Settings - Actions page of the repository or organization (depending on the installation mode).

## Security Considerations

This module creates resources in your AWS infrastructure, and EC2 instances for hosting the self-hosted runners on-demand. IAM permissions are set to a minimal level, and could be further limited by using permission boundaries. Instances permissions are limited to retrieve and delete the registration token, access the instance's own tags, and terminate the instance itself. By nature instances are short-lived, we strongly suggest to use ephemeral runners to ensure a safe build environment for each workflow job execution.

Ephemeral runners are using the JIT configuration, confguration that only can be used once to activate a runner. For non-ephemeral runners this option is not provided by GitHub. For non-ephemeeral runners a registration token is passed via SSM. After using the token, the token is deleted. But the token remains valid and is potential available in memory on the runner. For ephemeral runners this problem is avoid by using just in time tokens.

The examples are using standard AMI's for different operation systems. Instances are not hardened, and sudo operation are not blocked. To provide an out of the box working experience by default the module installs and configures the runner. However secrets are not hard coded, they finally end up in the memory of the instances. You can harden the instance by providing your own AMI and overwriting the cloud-init script.

We welcome any improvement to the standard module to make the default as secure as possible, in the end it remains your responsibility to keep your environment secure.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.2 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | ~> 5.2 |
| <a name="provider_random"></a> [random](#provider\_random) | ~> 3.0 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_runner_binaries"></a> [runner\_binaries](#module\_runner\_binaries) | ./modules/runner-binaries-syncer | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ./modules/runners | n/a |
| <a name="module_ssm"></a> [ssm](#module\_ssm) | ./modules/ssm | n/a |
| <a name="module_webhook"></a> [webhook](#module\_webhook) | ./modules/webhook | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_sqs_queue.queued_builds](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue.queued_builds_dlq](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue.webhook_events_workflow_job_queue](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue_policy.build_queue_dlq_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue_policy) | resource |
| [aws_sqs_queue_policy.build_queue_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue_policy) | resource |
| [aws_sqs_queue_policy.webhook_events_workflow_job_queue_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue_policy) | resource |
| [random_string.random](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/string) | resource |
| [aws_iam_policy_document.deny_unsecure_transport](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_ami_filter"></a> [ami\_filter](#input\_ami\_filter) | Map of lists used to create the AMI filter for the action runner AMI. | `map(list(string))` | <pre>{<br>  "state": [<br>    "available"<br>  ]<br>}</pre> | no |
| <a name="input_ami_id_ssm_parameter_name"></a> [ami\_id\_ssm\_parameter\_name](#input\_ami\_id\_ssm\_parameter\_name) | Externally managed SSM parameter (of data type aws:ec2:image) that contains the AMI ID to launch runner instances from. Overrides ami\_filter | `string` | `null` | no |
| <a name="input_ami_kms_key_arn"></a> [ami\_kms\_key\_arn](#input\_ami\_kms\_key\_arn) | Optional CMK Key ARN to be used to launch an instance from a shared encrypted AMI | `string` | `null` | no |
| <a name="input_ami_owners"></a> [ami\_owners](#input\_ami\_owners) | The list of owners used to select the AMI of action runner instances. | `list(string)` | <pre>[<br>  "amazon"<br>]</pre> | no |
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | (optiona) partition in the arn namespace to use if not 'aws' | `string` | `"aws"` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region. | `string` | n/a | yes |
| <a name="input_block_device_mappings"></a> [block\_device\_mappings](#input\_block\_device\_mappings) | The EC2 instance block device configuration. Takes the following keys: `device_name`, `delete_on_termination`, `volume_type`, `volume_size`, `encrypted`, `iops`, `throughput`, `kms_key_id`, `snapshot_id`. | <pre>list(object({<br>    delete_on_termination = optional(bool, true)<br>    device_name           = optional(string, "/dev/xvda")<br>    encrypted             = optional(bool, true)<br>    iops                  = optional(number)<br>    kms_key_id            = optional(string)<br>    snapshot_id           = optional(string)<br>    throughput            = optional(number)<br>    volume_size           = number<br>    volume_type           = optional(string, "gp3")<br>  }))</pre> | <pre>[<br>  {<br>    "volume_size": 30<br>  }<br>]</pre> | no |
| <a name="input_cloudwatch_config"></a> [cloudwatch\_config](#input\_cloudwatch\_config) | (optional) Replaces the module's default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details. | `string` | `null` | no |
| <a name="input_create_service_linked_role_spot"></a> [create\_service\_linked\_role\_spot](#input\_create\_service\_linked\_role\_spot) | (optional) create the service linked role for spot instances that is required by the scale-up lambda. | `bool` | `false` | no |
| <a name="input_delay_webhook_event"></a> [delay\_webhook\_event](#input\_delay\_webhook\_event) | The number of seconds the event accepted by the webhook is invisible on the queue before the scale up lambda will receive the event. | `number` | `30` | no |
| <a name="input_disable_runner_autoupdate"></a> [disable\_runner\_autoupdate](#input\_disable\_runner\_autoupdate) | Disable the auto update of the github runner agent. Be aware there is a grace period of 30 days, see also the [GitHub article](https://github.blog/changelog/2022-02-01-github-actions-self-hosted-runners-can-now-disable-automatic-updates/) | `bool` | `false` | no |
| <a name="input_enable_cloudwatch_agent"></a> [enable\_cloudwatch\_agent](#input\_enable\_cloudwatch\_agent) | Enables the cloudwatch agent on the ec2 runner instances. The runner uses a default config that can be overridden via `cloudwatch_config`. | `bool` | `true` | no |
| <a name="input_enable_enable_fifo_build_queue"></a> [enable\_enable\_fifo\_build\_queue](#input\_enable\_enable\_fifo\_build\_queue) | DEPCRECATED: Replaced by `enable_fifo_build_queue` / `fifo_build_queue`. | `string` | `null` | no |
| <a name="input_enable_ephemeral_runners"></a> [enable\_ephemeral\_runners](#input\_enable\_ephemeral\_runners) | Enable ephemeral runners, runners will only be used once. | `bool` | `false` | no |
| <a name="input_enable_event_rule_binaries_syncer"></a> [enable\_event\_rule\_binaries\_syncer](#input\_enable\_event\_rule\_binaries\_syncer) | Option to disable EventBridge Lambda trigger for the binary syncer, useful to stop automatic updates of binary distribution. | `bool` | `true` | no |
| <a name="input_enable_fifo_build_queue"></a> [enable\_fifo\_build\_queue](#input\_enable\_fifo\_build\_queue) | Enable a FIFO queue to keep the order of events received by the webhook. Recommended for repo level runners. | `bool` | `false` | no |
| <a name="input_enable_jit_config"></a> [enable\_jit\_config](#input\_enable\_jit\_config) | Overwrite the default behavior for JIT configuration. By default JIT configuration is enabled for ephemeral runners and disabled for non-ephemeral runners. In case of GHES check first if the JIT config API is avaialbe. In case you upgradeing from 3.x to 4.x you can set `enable_jit_config` to `false` to avoid a breaking change when having your own AMI. | `bool` | `null` | no |
| <a name="input_enable_job_queued_check"></a> [enable\_job\_queued\_check](#input\_enable\_job\_queued\_check) | Only scale if the job event received by the scale up lambda is in the queued state. By default enabled for non ephemeral runners and disabled for ephemeral. Set this variable to overwrite the default behavior. | `bool` | `null` | no |
| <a name="input_enable_managed_runner_security_group"></a> [enable\_managed\_runner\_security\_group](#input\_enable\_managed\_runner\_security\_group) | Enables creation of the default managed security group. Unmanaged security groups can be specified via `runner_additional_security_group_ids`. | `bool` | `true` | no |
| <a name="input_enable_organization_runners"></a> [enable\_organization\_runners](#input\_enable\_organization\_runners) | Register runners to organization, instead of repo level | `bool` | `false` | no |
| <a name="input_enable_runner_binaries_syncer"></a> [enable\_runner\_binaries\_syncer](#input\_enable\_runner\_binaries\_syncer) | Option to disable the lambda to sync GitHub runner distribution, useful when using a pre-build AMI. | `bool` | `true` | no |
| <a name="input_enable_runner_detailed_monitoring"></a> [enable\_runner\_detailed\_monitoring](#input\_enable\_runner\_detailed\_monitoring) | Should detailed monitoring be enabled for the runner. Set this to true if you want to use detailed monitoring. See https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-cloudwatch-new.html for details. | `bool` | `false` | no |
| <a name="input_enable_runner_workflow_job_labels_check_all"></a> [enable\_runner\_workflow\_job\_labels\_check\_all](#input\_enable\_runner\_workflow\_job\_labels\_check\_all) | If set to true all labels in the workflow job must match the GitHub labels (os, architecture and `self-hosted`). When false if __any__ label matches it will trigger the webhook. | `bool` | `true` | no |
| <a name="input_enable_ssm_on_runners"></a> [enable\_ssm\_on\_runners](#input\_enable\_ssm\_on\_runners) | Enable to allow access to the runner instances for debugging purposes via SSM. Note that this adds additional permissions to the runner instances. | `bool` | `false` | no |
| <a name="input_enable_user_data_debug_logging_runner"></a> [enable\_user\_data\_debug\_logging\_runner](#input\_enable\_user\_data\_debug\_logging\_runner) | Option to enable debug logging for user-data, this logs all secrets as well. | `bool` | `false` | no |
| <a name="input_enable_userdata"></a> [enable\_userdata](#input\_enable\_userdata) | Should the userdata script be enabled for the runner. Set this to false if you are using your own prebuilt AMI. | `bool` | `true` | no |
| <a name="input_enable_workflow_job_events_queue"></a> [enable\_workflow\_job\_events\_queue](#input\_enable\_workflow\_job\_events\_queue) | Enabling this experimental feature will create a secondory sqs queue to which a copy of the workflow\_job event will be delivered. | `bool` | `false` | no |
| <a name="input_enabled_userdata"></a> [enabled\_userdata](#input\_enabled\_userdata) | DEPCRECATED: Replaced by `enable_userdata`. | `string` | `null` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | DEPRECATED, no longer used. See `prefix` | `string` | `null` | no |
| <a name="input_fifo_build_queue"></a> [fifo\_build\_queue](#input\_fifo\_build\_queue) | DEPCRECATED: Replaced by `enable_fifo_build_queue`. | `string` | `null` | no |
| <a name="input_ghes_ssl_verify"></a> [ghes\_ssl\_verify](#input\_ghes\_ssl\_verify) | GitHub Enterprise SSL verification. Set to 'false' when custom certificate (chains) is used for GitHub Enterprise Server (insecure). | `bool` | `true` | no |
| <a name="input_ghes_url"></a> [ghes\_url](#input\_ghes\_url) | GitHub Enterprise Server URL. Example: https://github.internal.co - DO NOT SET IF USING PUBLIC GITHUB | `string` | `null` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub app parameters, see your github app. Ensure the key is the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`). | <pre>object({<br>    key_base64     = string<br>    id             = string<br>    webhook_secret = string<br>  })</pre> | n/a | yes |
| <a name="input_idle_config"></a> [idle\_config](#input\_idle\_config) | List of time periods, defined as a cron expression, to keep a minimum amount of runners active instead of scaling down to 0. By defining this list you can ensure that in time periods that match the cron expression within 5 seconds a runner is kept idle. | <pre>list(object({<br>    cron      = string<br>    timeZone  = string<br>    idleCount = number<br>  }))</pre> | `[]` | no |
| <a name="input_instance_allocation_strategy"></a> [instance\_allocation\_strategy](#input\_instance\_allocation\_strategy) | The allocation strategy for spot instances. AWS recommends using `price-capacity-optimized` however the AWS default is `lowest-price`. | `string` | `"lowest-price"` | no |
| <a name="input_instance_max_spot_price"></a> [instance\_max\_spot\_price](#input\_instance\_max\_spot\_price) | Max price price for spot instances per hour. This variable will be passed to the create fleet as max spot price for the fleet. | `string` | `null` | no |
| <a name="input_instance_profile_path"></a> [instance\_profile\_path](#input\_instance\_profile\_path) | The path that will be added to the instance\_profile, if not set the environment name will be used. | `string` | `null` | no |
| <a name="input_instance_target_capacity_type"></a> [instance\_target\_capacity\_type](#input\_instance\_target\_capacity\_type) | Default lifecycle used for runner instances, can be either `spot` or `on-demand`. | `string` | `"spot"` | no |
| <a name="input_instance_types"></a> [instance\_types](#input\_instance\_types) | List of instance types for the action runner. Defaults are based on runner\_os (amzn2 for linux and Windows Server Core for win). | `list(string)` | <pre>[<br>  "m5.large",<br>  "c5.large"<br>]</pre> | no |
| <a name="input_job_queue_retention_in_seconds"></a> [job\_queue\_retention\_in\_seconds](#input\_job\_queue\_retention\_in\_seconds) | The number of seconds the job is held in the queue before it is purged. | `number` | `86400` | no |
| <a name="input_key_name"></a> [key\_name](#input\_key\_name) | Key pair name | `string` | `null` | no |
| <a name="input_kms_key_arn"></a> [kms\_key\_arn](#input\_kms\_key\_arn) | Optional CMK Key ARN to be used for Parameter Store. This key must be in the current account. | `string` | `null` | no |
| <a name="input_lambda_architecture"></a> [lambda\_architecture](#input\_lambda\_architecture) | AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86\_64' functions. | `string` | `"arm64"` | no |
| <a name="input_lambda_principals"></a> [lambda\_principals](#input\_lambda\_principals) | (Optional) add extra principals to the role created for execution of the lambda, e.g. for local testing. | <pre>list(object({<br>    type        = string<br>    identifiers = list(string)<br>  }))</pre> | `[]` | no |
| <a name="input_lambda_runtime"></a> [lambda\_runtime](#input\_lambda\_runtime) | AWS Lambda runtime. | `string` | `"nodejs18.x"` | no |
| <a name="input_lambda_s3_bucket"></a> [lambda\_s3\_bucket](#input\_lambda\_s3\_bucket) | S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly. | `string` | `null` | no |
| <a name="input_lambda_security_group_ids"></a> [lambda\_security\_group\_ids](#input\_lambda\_security\_group\_ids) | List of security group IDs associated with the Lambda function. | `list(string)` | `[]` | no |
| <a name="input_lambda_subnet_ids"></a> [lambda\_subnet\_ids](#input\_lambda\_subnet\_ids) | List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`. | `list(string)` | `[]` | no |
| <a name="input_lambda_tracing_mode"></a> [lambda\_tracing\_mode](#input\_lambda\_tracing\_mode) | Enable X-Ray tracing for the lambda functions. | `string` | `null` | no |
| <a name="input_log_level"></a> [log\_level](#input\_log\_level) | Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'. | `string` | `"info"` | no |
| <a name="input_log_type"></a> [log\_type](#input\_log\_type) | Logging format for lambda logging. Valid values are 'json', 'pretty', 'hidden'. | `string` | `null` | no |
| <a name="input_logging_kms_key_id"></a> [logging\_kms\_key\_id](#input\_logging\_kms\_key\_id) | Specifies the kms key id to encrypt the logs with. | `string` | `null` | no |
| <a name="input_logging_retention_in_days"></a> [logging\_retention\_in\_days](#input\_logging\_retention\_in\_days) | Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653. | `number` | `180` | no |
| <a name="input_minimum_running_time_in_minutes"></a> [minimum\_running\_time\_in\_minutes](#input\_minimum\_running\_time\_in\_minutes) | The time an ec2 action runner should be running at minimum before terminated, if not busy. | `number` | `null` | no |
| <a name="input_pool_config"></a> [pool\_config](#input\_pool\_config) | The configuration for updating the pool. The `pool_size` to adjust to by the events triggered by the `schedule_expression`. For example you can configure a cron expression for weekdays to adjust the pool to 10 and another expression for the weekend to adjust the pool to 1. | <pre>list(object({<br>    schedule_expression = string<br>    size                = number<br>  }))</pre> | `[]` | no |
| <a name="input_pool_lambda_reserved_concurrent_executions"></a> [pool\_lambda\_reserved\_concurrent\_executions](#input\_pool\_lambda\_reserved\_concurrent\_executions) | Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations. | `number` | `1` | no |
| <a name="input_pool_lambda_timeout"></a> [pool\_lambda\_timeout](#input\_pool\_lambda\_timeout) | Time out for the pool lambda in seconds. | `number` | `60` | no |
| <a name="input_pool_runner_owner"></a> [pool\_runner\_owner](#input\_pool\_runner\_owner) | The pool will deploy runners to the GitHub org ID, set this value to the org to which you want the runners deployed. Repo level is not supported. | `string` | `null` | no |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | The prefix used for naming resources | `string` | `"github-actions"` | no |
| <a name="input_queue_encryption"></a> [queue\_encryption](#input\_queue\_encryption) | Configure how data on queues managed by the modules in ecrypted at REST. Options are encryped via SSE, non encrypted and via KMSS. By default encryptes via SSE is enabled. See for more details the Terraform `aws_sqs_queue` resource https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue. | <pre>object({<br>    kms_data_key_reuse_period_seconds = number<br>    kms_master_key_id                 = string<br>    sqs_managed_sse_enabled           = bool<br>  })</pre> | <pre>{<br>  "kms_data_key_reuse_period_seconds": null,<br>  "kms_master_key_id": null,<br>  "sqs_managed_sse_enabled": true<br>}</pre> | no |
| <a name="input_redrive_build_queue"></a> [redrive\_build\_queue](#input\_redrive\_build\_queue) | Set options to attach (optional) a dead letter queue to the build queue, the queue between the webhook and the scale up lambda. You have the following options. 1. Disable by setting `enabled` to false. 2. Enable by setting `enabled` to `true`, `maxReceiveCount` to a number of max retries. | <pre>object({<br>    enabled         = bool<br>    maxReceiveCount = number<br>  })</pre> | <pre>{<br>  "enabled": false,<br>  "maxReceiveCount": null<br>}</pre> | no |
| <a name="input_repository_white_list"></a> [repository\_white\_list](#input\_repository\_white\_list) | List of github repository full names (owner/repo\_name) that will be allowed to use the github app. Leave empty for no filtering. | `list(string)` | `[]` | no |
| <a name="input_role_path"></a> [role\_path](#input\_role\_path) | The path that will be added to role path for created roles, if not set the environment name will be used. | `string` | `null` | no |
| <a name="input_role_permissions_boundary"></a> [role\_permissions\_boundary](#input\_role\_permissions\_boundary) | Permissions boundary that will be added to the created roles. | `string` | `null` | no |
| <a name="input_runner_additional_security_group_ids"></a> [runner\_additional\_security\_group\_ids](#input\_runner\_additional\_security\_group\_ids) | (optional) List of additional security groups IDs to apply to the runner. | `list(string)` | `[]` | no |
| <a name="input_runner_allow_prerelease_binaries"></a> [runner\_allow\_prerelease\_binaries](#input\_runner\_allow\_prerelease\_binaries) | (Deprecated, no longer used), allow the runners to update to prerelease binaries. | `bool` | `null` | no |
| <a name="input_runner_architecture"></a> [runner\_architecture](#input\_runner\_architecture) | The platform architecture of the runner instance\_type. | `string` | `"x64"` | no |
| <a name="input_runner_as_root"></a> [runner\_as\_root](#input\_runner\_as\_root) | Run the action runner under the root user. Variable `runner_run_as` will be ignored. | `bool` | `false` | no |
| <a name="input_runner_binaries_s3_logging_bucket"></a> [runner\_binaries\_s3\_logging\_bucket](#input\_runner\_binaries\_s3\_logging\_bucket) | Bucket for action runner distribution bucket access logging. | `string` | `null` | no |
| <a name="input_runner_binaries_s3_logging_bucket_prefix"></a> [runner\_binaries\_s3\_logging\_bucket\_prefix](#input\_runner\_binaries\_s3\_logging\_bucket\_prefix) | Bucket prefix for action runner distribution bucket access logging. | `string` | `null` | no |
| <a name="input_runner_binaries_s3_sse_configuration"></a> [runner\_binaries\_s3\_sse\_configuration](#input\_runner\_binaries\_s3\_sse\_configuration) | Map containing server-side encryption configuration for runner-binaries S3 bucket. | `any` | <pre>{<br>  "rule": {<br>    "apply_server_side_encryption_by_default": {<br>      "sse_algorithm": "AES256"<br>    }<br>  }<br>}</pre> | no |
| <a name="input_runner_binaries_s3_versioning"></a> [runner\_binaries\_s3\_versioning](#input\_runner\_binaries\_s3\_versioning) | Status of S3 versioning for runner-binaries S3 bucket. Once set to Enabled the change cannot be reverted via Terraform! | `string` | `"Disabled"` | no |
| <a name="input_runner_binaries_syncer_lambda_timeout"></a> [runner\_binaries\_syncer\_lambda\_timeout](#input\_runner\_binaries\_syncer\_lambda\_timeout) | Time out of the binaries sync lambda in seconds. | `number` | `300` | no |
| <a name="input_runner_binaries_syncer_lambda_zip"></a> [runner\_binaries\_syncer\_lambda\_zip](#input\_runner\_binaries\_syncer\_lambda\_zip) | File location of the binaries sync lambda zip file. | `string` | `null` | no |
| <a name="input_runner_boot_time_in_minutes"></a> [runner\_boot\_time\_in\_minutes](#input\_runner\_boot\_time\_in\_minutes) | The minimum time for an EC2 runner to boot and register as a runner. | `number` | `5` | no |
| <a name="input_runner_credit_specification"></a> [runner\_credit\_specification](#input\_runner\_credit\_specification) | The credit option for CPU usage of a T instance. Can be unset, "standard" or "unlimited". | `string` | `null` | no |
| <a name="input_runner_ec2_tags"></a> [runner\_ec2\_tags](#input\_runner\_ec2\_tags) | Map of tags that will be added to the launch template instance tag specifications. | `map(string)` | `{}` | no |
| <a name="input_runner_egress_rules"></a> [runner\_egress\_rules](#input\_runner\_egress\_rules) | List of egress rules for the GitHub runner instances. | <pre>list(object({<br>    cidr_blocks      = list(string)<br>    ipv6_cidr_blocks = list(string)<br>    prefix_list_ids  = list(string)<br>    from_port        = number<br>    protocol         = string<br>    security_groups  = list(string)<br>    self             = bool<br>    to_port          = number<br>    description      = string<br>  }))</pre> | <pre>[<br>  {<br>    "cidr_blocks": [<br>      "0.0.0.0/0"<br>    ],<br>    "description": null,<br>    "from_port": 0,<br>    "ipv6_cidr_blocks": [<br>      "::/0"<br>    ],<br>    "prefix_list_ids": null,<br>    "protocol": "-1",<br>    "security_groups": null,<br>    "self": null,<br>    "to_port": 0<br>  }<br>]</pre> | no |
| <a name="input_runner_enable_workflow_job_labels_check_all"></a> [runner\_enable\_workflow\_job\_labels\_check\_all](#input\_runner\_enable\_workflow\_job\_labels\_check\_all) | DEPCRECATED: Replaced by `enable_runner_workflow_job_labels_check_all`. | `string` | `null` | no |
| <a name="input_runner_extra_labels"></a> [runner\_extra\_labels](#input\_runner\_extra\_labels) | Extra (custom) labels for the runners (GitHub). Separate each label by a comma. Labels checks on the webhook can be enforced by setting `enable_workflow_job_labels_check`. GitHub read-only labels should not be provided. | `string` | `""` | no |
| <a name="input_runner_group_name"></a> [runner\_group\_name](#input\_runner\_group\_name) | Name of the runner group. | `string` | `"Default"` | no |
| <a name="input_runner_iam_role_managed_policy_arns"></a> [runner\_iam\_role\_managed\_policy\_arns](#input\_runner\_iam\_role\_managed\_policy\_arns) | Attach AWS or customer-managed IAM policies (by ARN) to the runner IAM role | `list(string)` | `[]` | no |
| <a name="input_runner_log_files"></a> [runner\_log\_files](#input\_runner\_log\_files) | (optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details. | <pre>list(object({<br>    log_group_name   = string<br>    prefix_log_group = bool<br>    file_path        = string<br>    log_stream_name  = string<br>  }))</pre> | `null` | no |
| <a name="input_runner_metadata_options"></a> [runner\_metadata\_options](#input\_runner\_metadata\_options) | Metadata options for the ec2 runner instances. By default, the module uses metadata tags for bootstrapping the runner, only disable `instance_metadata_tags` when using custom scripts for starting the runner. | `map(any)` | <pre>{<br>  "http_endpoint": "enabled",<br>  "http_put_response_hop_limit": 1,<br>  "http_tokens": "optional",<br>  "instance_metadata_tags": "enabled"<br>}</pre> | no |
| <a name="input_runner_name_prefix"></a> [runner\_name\_prefix](#input\_runner\_name\_prefix) | The prefix used for the GitHub runner name. The prefix will be used in the default start script to prefix the instance name when register the runner in GitHub. The value is availabe via an EC2 tag 'ghr:runner\_name\_prefix'. | `string` | `""` | no |
| <a name="input_runner_os"></a> [runner\_os](#input\_runner\_os) | The EC2 Operating System type to use for action runner instances (linux,windows). | `string` | `"linux"` | no |
| <a name="input_runner_run_as"></a> [runner\_run\_as](#input\_runner\_run\_as) | Run the GitHub actions agent as user. | `string` | `"ec2-user"` | no |
| <a name="input_runners_lambda_s3_key"></a> [runners\_lambda\_s3\_key](#input\_runners\_lambda\_s3\_key) | S3 key for runners lambda function. Required if using S3 bucket to specify lambdas. | `string` | `null` | no |
| <a name="input_runners_lambda_s3_object_version"></a> [runners\_lambda\_s3\_object\_version](#input\_runners\_lambda\_s3\_object\_version) | S3 object version for runners lambda function. Useful if S3 versioning is enabled on source bucket. | `string` | `null` | no |
| <a name="input_runners_lambda_zip"></a> [runners\_lambda\_zip](#input\_runners\_lambda\_zip) | File location of the lambda zip file for scaling runners. | `string` | `null` | no |
| <a name="input_runners_maximum_count"></a> [runners\_maximum\_count](#input\_runners\_maximum\_count) | The maximum number of runners that will be created. | `number` | `3` | no |
| <a name="input_runners_scale_down_lambda_timeout"></a> [runners\_scale\_down\_lambda\_timeout](#input\_runners\_scale\_down\_lambda\_timeout) | Time out for the scale down lambda in seconds. | `number` | `60` | no |
| <a name="input_runners_scale_up_lambda_timeout"></a> [runners\_scale\_up\_lambda\_timeout](#input\_runners\_scale\_up\_lambda\_timeout) | Time out for the scale up lambda in seconds. | `number` | `30` | no |
| <a name="input_scale_down_schedule_expression"></a> [scale\_down\_schedule\_expression](#input\_scale\_down\_schedule\_expression) | Scheduler expression to check every x for scale down. | `string` | `"cron(*/5 * * * ? *)"` | no |
| <a name="input_scale_up_reserved_concurrent_executions"></a> [scale\_up\_reserved\_concurrent\_executions](#input\_scale\_up\_reserved\_concurrent\_executions) | Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations. | `number` | `1` | no |
| <a name="input_ssm_paths"></a> [ssm\_paths](#input\_ssm\_paths) | The root path used in SSM to store configuration and secrets. | <pre>object({<br>    root       = optional(string, "github-action-runners")<br>    app        = optional(string, "app")<br>    runners    = optional(string, "runners")<br>    use_prefix = optional(bool, true)<br>  })</pre> | `{}` | no |
| <a name="input_subnet_ids"></a> [subnet\_ids](#input\_subnet\_ids) | List of subnets in which the action runner instances will be launched. The subnets need to exist in the configured VPC (`vpc_id`), and must reside in different availability zones (see https://github.com/philips-labs/terraform-aws-github-runner/issues/2904) | `list(string)` | n/a | yes |
| <a name="input_syncer_lambda_s3_key"></a> [syncer\_lambda\_s3\_key](#input\_syncer\_lambda\_s3\_key) | S3 key for syncer lambda function. Required if using an S3 bucket to specify lambdas. | `string` | `null` | no |
| <a name="input_syncer_lambda_s3_object_version"></a> [syncer\_lambda\_s3\_object\_version](#input\_syncer\_lambda\_s3\_object\_version) | S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket. | `string` | `null` | no |
| <a name="input_tags"></a> [tags](#input\_tags) | Map of tags that will be added to created resources. By default resources will be tagged with name and environment. | `map(string)` | `{}` | no |
| <a name="input_userdata_post_install"></a> [userdata\_post\_install](#input\_userdata\_post\_install) | Script to be ran after the GitHub Actions runner is installed on the EC2 instances | `string` | `""` | no |
| <a name="input_userdata_pre_install"></a> [userdata\_pre\_install](#input\_userdata\_pre\_install) | Script to be ran before the GitHub Actions runner is installed on the EC2 instances | `string` | `""` | no |
| <a name="input_userdata_template"></a> [userdata\_template](#input\_userdata\_template) | Alternative user-data template, replacing the default template. By providing your own user\_data you have to take care of installing all required software, including the action runner. Variables userdata\_pre/post\_install are ignored. | `string` | `null` | no |
| <a name="input_vpc_id"></a> [vpc\_id](#input\_vpc\_id) | The VPC for security groups of the action runners. | `string` | n/a | yes |
| <a name="input_webhook_lambda_apigateway_access_log_settings"></a> [webhook\_lambda\_apigateway\_access\_log\_settings](#input\_webhook\_lambda\_apigateway\_access\_log\_settings) | n/a | <pre>object({<br>    destination_arn = string<br>    format          = string<br>  })</pre> | `null` | no |
| <a name="input_webhook_lambda_s3_key"></a> [webhook\_lambda\_s3\_key](#input\_webhook\_lambda\_s3\_key) | S3 key for webhook lambda function. Required if using S3 bucket to specify lambdas. | `string` | `null` | no |
| <a name="input_webhook_lambda_s3_object_version"></a> [webhook\_lambda\_s3\_object\_version](#input\_webhook\_lambda\_s3\_object\_version) | S3 object version for webhook lambda function. Useful if S3 versioning is enabled on source bucket. | `string` | `null` | no |
| <a name="input_webhook_lambda_timeout"></a> [webhook\_lambda\_timeout](#input\_webhook\_lambda\_timeout) | Time out of the webhook lambda in seconds. | `number` | `10` | no |
| <a name="input_webhook_lambda_zip"></a> [webhook\_lambda\_zip](#input\_webhook\_lambda\_zip) | File location of the webhook lambda zip file. | `string` | `null` | no |
| <a name="input_workflow_job_queue_configuration"></a> [workflow\_job\_queue\_configuration](#input\_workflow\_job\_queue\_configuration) | Configuration options for workflow job queue which is only applicable if the flag enable\_workflow\_job\_events\_queue is set to true. | <pre>object({<br>    delay_seconds              = number<br>    visibility_timeout_seconds = number<br>    message_retention_seconds  = number<br>  })</pre> | <pre>{<br>  "delay_seconds": null,<br>  "message_retention_seconds": null,<br>  "visibility_timeout_seconds": null<br>}</pre> | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_binaries_syncer"></a> [binaries\_syncer](#output\_binaries\_syncer) | n/a |
| <a name="output_queues"></a> [queues](#output\_queues) | SQS queues. |
| <a name="output_runners"></a> [runners](#output\_runners) | n/a |
| <a name="output_ssm_parameters"></a> [ssm\_parameters](#output\_ssm\_parameters) | n/a |
| <a name="output_webhook"></a> [webhook](#output\_webhook) | n/a |
<!-- END_TF_DOCS -->

## Contributing

We welcome contributions, please checkout the [contribution guide](CONTRIBUTING.md). Be aware we use [pre commit hooks](https://pre-commit.com/) to update the docs.

## Philips Forest

This module is part of the Philips Forest.

```plain
                                                     ___                   _
                                                    / __\__  _ __ ___  ___| |_
                                                   / _\/ _ \| '__/ _ \/ __| __|
                                                  / / | (_) | | |  __/\__ \ |_
                                                  \/   \___/|_|  \___||___/\__|

                                                                 Infrastructure
```

Talk to the forestkeepers in the `runners`-channel on Slack.

[![Slack](https://img.shields.io/badge/Slack-4A154B?style=for-the-badge&logo=slack&logoColor=white)](https://join.slack.com/t/philips-software/shared_invite/zt-xecw65v5-i1531hGP~mdVwgxLFx7ckg)
