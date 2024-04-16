# GitHub Self-Hosted on AWS on Spot Instances

This [Terraform](https://www.terraform.io/) module creates the required infrastructure needed to host [GitHub Actions](https://github.com/features/actions) self-hosted, auto-scaling runners on [AWS spot instances](https://aws.amazon.com/ec2/spot/). It provides the required logic to handle the life cycle for scaling up and down using a set of AWS Lambda functions. Runners are scaled down to zero to avoid costs when no workflows are active.

![Architecture](assets/runners.light.png#only-light)
![Architecture](assets/runners.dark.png#only-dark)

## Motivation

GitHub Actions `self-hosted` runners provide a flexible option to run CI workloads on the infrastructure of your choice. However, currently GitHub does not provide tooling to automate the creation and scaling of action runners. This module creates the AWS infrastructure to host action runners on spot instances. It also provides lambda modules to orchestrate the life cycle of the action runners.

Lambda was selected as the preferred runtime for two primary reasons. Firstly, it enables the development of compact components with limited access to AWS and GitHub. Secondly, it offers a scalable configuration with minimal expenses, applicable at both the repository and organizational levels. The Lambda functions will be responsible for provisioning Linux-based EC2 instances equipped with Docker to handle CI workloads compatible with Linux and/or Docker. The primary objective is to facilitate Docker-based workloads.

A pertinent question may arise: why not opt for Kubernetes? The current strategy aligns closely with the implementation of GitHub's action runners. The chosen approach involves installing the runner on a host where the necessary software is readily available, maintaining proximity to GitHub's existing practices. Another viable option could be AWS Auto Scaling groups. However, this alternative usually demands broader permissions at the instance level from GitHub. Additionally, managing the scaling process, both up and down, becomes a non-trivial task in this scenario.

## Overview

The module is designed to be used in a GitHub organization. It can also be used in a GitHub repository, but this not supports all features. The module is receiving GitHub webhook events for the `workflow_job` event. The module will create a new runner if the event is for a workflow that requires a runner, and no runner is available. Alteratively the module can be configured as ephemeral runners. In this case the module will create a new runner for each workflow job event.

For ephemeral runners a pool is can be configured. The pool maintains a minimum number of runners based on a schedule. The pool works only for org level runners.

For non ephemeral runners with the idle config the module will avoid scaling down back to zero. Instead it will maintain a minimum number of runners based on a schedule. This avoids the need to scale up when a new workflow is triggered.


## Detailed design

The diagram below shows the architecture of the module, groups are indicating the different components. Ww will go through the components in the following sections.

![Architecture](assets/aws-architecture.light.png#only-light)
![Architecture](assets/aws-architecture.dark.png#only-dark)

### Webhook

The moment a GitHub action workflow requiring a `self-hosted` runner is triggered, GitHub will try to find a runner which can execute the workload. See [additional notes](additional_notes.md) for how the selection is made. This module reacts to GitHub's [`workflow_job` event](https://docs.github.com/en/free-pro-team@latest/developers/webhooks-and-events/webhook-events-and-payloads#workflow_job) for the triggered workflow and creates a new runner if necessary.

For receiving the `workflow_job` event by the webhook (lambda), a webhook needs to be created in GitHub. The same app as for API calls can be used to create the webhook. Or a dedicated webhook can be defined.

- Create a GitHub app, define a webhook and subscribe the app to the `workflow_job` event.
- Create a webhook on enterprise, org or repo level, define a webhook and subscribe the app to the `workflow_job` event.

In AWS an [API gateway](https://docs.aws.amazon.com/apigateway/index.html) endpoint is created that is able to receive the GitHub webhook events via HTTP post. The gateway triggers the webhook lambda which will verify the signature of the event. This check guarantees the event is sent by the GitHub App. The lambda only handles `workflow_job` events with status `queued` and matching the runner labels. The accepted events are posted on a SQS queue. Messages on this queue will be delayed for a configurable amount of seconds (default 30 seconds) to give the available runners time to pick up this build.

### Control plane

The "Scale Up Runner" Lambda actively monitors the SQS queue, processing incoming events. The Lambda conducts a series of checks to determine the necessity of creating a new EC2 spot instance. For instance, it refrains from creating an instance if a build is already initiated by an existing runner or if the maximum allowable number of runners has been reached.

The Lambda first requests a JIT configuration or registration token from GitHub, which is needed later by the runner to register itself. This avoids the case that the EC2 instance, which later in the process will install the agent, needs administration permissions to register the runner. Next, the EC2 spot instance is created via the launch template. The launch template defines the specifications of the required instance and contains a [`user_data`](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html) script. This script will install the required software and configure it. The configuration for the runner is shared via EC2 tags and the parameter store (SSM), from which the user data script will fetch it and delete it once it has been retrieved. Once the user data script is finished, the action runner should be online, and the workflow will start in seconds.

The current method for scaling down runners employs a straightforward approach: at predefined intervals, the Lambda conducts a thorough examination of each runner (instance) to assess its activity. If a runner is found to be idle, it is deregistered from GitHub, and the associated AWS instance is terminated. For ephemeral runners the the instance is terminated immediately after the workflow is finished. To avoid orphaned runners the scale down lambda is active in this cae as well.

### Pool

The pool is only designed for org level runners in ephemeral mode. The pool will maintain a minimum number of runners based on a schedule. Keeping a small pool can help to start jobs faster and avoid missed events are causing long hanging jobs. The pool is opt in, it will not be created by default.

### Agent sync

To address potential delays in downloading the GitHub Action Runner distribution, a lambda function has been implemented to synchronize the action runner binary from GitHub to an S3 bucket. This ensures that the EC2 instance can retrieve the distribution from the S3 bucket, mitigating the need to rely on internet downloads, which can occasionally take more than 10 minutes. The best way to speed up instance startup is to use a pre-built AMI with the runner binary already installed. See the [examples](examples/index.md) for more details.

### SSM housekeeping

The control plane (scale up lambda) will store the runner registration configuration in the SSM parameter store. The token is stored in a secure string parameter. The token is deleted after the runner has registered itself. The token is also deleted after a configurable amount of time (default 24 hours). This house keeping ensures that your SSM parameter store does not fill up with old configuration.

### AMI cleaner

The AMI cleaner is a lambda that will clean up AMIs that are older than a configurable amount of days. This is useful when using the AMI builder to create AMIs. The cleaner will also check which AMIs are used the latest version of the launch template. And you can provide SSM config paths pointing to AMI IDs. The cleaner will not delete these AMIs. The AMI cleaner is opt in, it will not be created by default.

### Instance Termination Watcher

> This feature is Beta, changes will not trigger a major release as long in beta.

The Instance Termination Watcher is creating log and optional metrics for termination of instances. Currently only spot termination warnings are watched. See [configuration](configuration/) for more details. 

### Security

Sensitive information such as secrets and private keys is stored securely in the SSM Parameter Store. These values undergo encryption using either the default KMS key for SSM or a custom KMS key, depending on the specified configuration.

Permission are managed in several places. Below are the most important ones. For details check the Terraform sources.

- The GitHub App requires access to actions and to publish `workflow_job` events to the AWS webhook (API gateway).
- The scale up lambda should have access to EC2 for creating and tagging instances.
- The scale down lambda should have access to EC2 to terminate instances.

Besides these permissions, the lambdas also need permission to CloudWatch (for logging and scheduling), SSM and S3. For more details about the required permissions see the [documentation](modules/public/setup-iam-permissions.md) of the IAM module which uses permission boundaries.

## Terraform main modules

Currently we support two main modules. The `runners` module is the main module for creating runners. And the 'multi-runner' module is a wrapper around the `runners` module to create multiple runners in one go. The `multi-runner` module is useful for creating runners for multiple repositories or organizations.

Both modules are built on top of the same base modules. When using the multi-runner module you can deploy different runners with only one deployment.

![multi-runner](assets/multi-runner.light.png#only-light)
![multi-runner](assets/multi-runner.dark.png#only-dark)

## Recommendations

The module contains a lot of configuration options. The default values are a good starting point. But you may want to tweak some of the values. Below are some recommendations. We suggest the following configuration for the runners:

- Use the multi-runner module to create multiple runners in one go.
- Use the ephemeral runners for org level runners. To improve the security of your runners.
- Use pre-built AMIs to speed up the startup of your runners.
