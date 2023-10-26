# Terraform module for scalable self hosted GitHub action runners <!-- omit in toc -->

[![awesome-runners](https://img.shields.io/badge/listed%20on-awesome--runners-blue.svg)](https://github.com/jonico/awesome-runners)[![Terraform registry](https://img.shields.io/github/v/release/philips-labs/terraform-aws-github-runner?label=Terraform%20Registry)](https://registry.terraform.io/modules/philips-labs/github-runner/aws/) [![Terraform checks](https://github.com/philips-labs/terraform-aws-github-runner/actions/workflows/terraform.yml/badge.svg)](https://github.com/philips-labs/terraform-aws-github-runner/actions/workflows/terraform.yml) [![Lambdas](https://github.com/philips-labs/terraform-aws-github-runner/actions/workflows/lambda.yml/badge.svg)](https://github.com/philips-labs/terraform-aws-github-runner/actions/workflows/lambda.yml)

This [Terraform](https://www.terraform.io/) module creates the required infrastructure needed to host [GitHub Actions](https://github.com/features/actions) self-hosted, auto-scaling runners on [AWS spot instances](https://aws.amazon.com/ec2/spot/). It provides the required logic to handle the life cycle for scaling up and down using a set of AWS Lambda functions. Runners are scaled down to zero to avoid costs when no workflows are active.

> 📢 We maintain the project as a thruly open-source project. We maintain the project on best effor. We welcome contributions from the community. Feel free to help us answering issues, reviewing PR's, maintain and improve the project.

> 📢 [`v5`](https://github.com/philips-labs/terraform-aws-github-runner/pull/3552) replaces Amazon Linux 2 by Amazon Linux 2023 as default OS. Check the PR for more details and other changes.

> 📢 For contibutions to older versions you can make a PR to the related branch, e.g. `v4`. We have no release process in place for older versions.

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
- [Contributing](#contributing)
- [Philips Forest](#philips-forest)

## Motivation

GitHub Actions `self-hosted` runners provide a flexible option to run CI workloads on the infrastructure of your choice. Currently, no option is provided to automate the creation and scaling of action runners. This module creates the AWS infrastructure to host action runners on spot instances. It provides lambda modules to orchestrate the life cycle of the action runners.

Lambda is chosen as the runtime for two major reasons. First, it allows the creation of small components with minimal access to AWS and GitHub. Secondly, it provides a scalable setup with minimal costs that works on repo level and scales to organization level. The lambdas will create Linux based EC2 instances with Docker to serve CI workloads that can run on Linux and/or Docker. The main goal is to support Docker-based workloads.

A logical question would be, why not Kubernetes? In the current approach, we stay close to how the GitHub action runners are implemented today. The approach is to install the runner on a host where the required software is available. With this setup, we stay quite close to the current GitHub approach. Another logical choice would be AWS Auto Scaling groups. However, this choice would typically require much more permissions at the instance level to GitHub. And besides that, scaling up and down is not trivial.

## Overview

The moment a GitHub action workflow requiring a `self-hosted` runner is triggered, GitHub will try to find a runner which can execute the workload. See [additional notes](docs/additional_notes.md) for how the selection is made. This module reacts to GitHub's [`workflow_job` event](https://docs.github.com/en/free-pro-team@latest/developers/webhooks-and-events/webhook-events-and-payloads#workflow_job) for the triggered workflow and creates a new runner if necessary.

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

This module also allows you to run agents from a prebuilt AMI to gain faster startup times. The module provides several examples to build your own custom AMI. To remove old images, an [AMI housekeeper module](./modules/ami-housekeeper/README.md) can be used. You can find more information in [the image README.md](/images/README.md) for building custom images.

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

Talk to the forestkeepers in the `runners-channel` on Slack.

[![Slack](https://img.shields.io/badge/Slack-4A154B?style=for-the-badge&logo=slack&logoColor=white)](https://join.slack.com/t/philips-software/shared_invite/zt-xecw65v5-i1531hGP~mdVwgxLFx7ckg)
