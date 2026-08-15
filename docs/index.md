# GitHub Self-Hosted on AWS on Spot Instances

This [Terraform](https://www.terraform.io/) module creates the required infrastructure needed to host [GitHub Actions](https://github.com/features/actions) self-hosted, auto-scaling runners on [AWS spot instances](https://aws.amazon.com/ec2/spot/). It provides the required logic to handle the lifecycle for scaling up and down using a set of AWS Lambda functions. Runners are scaled down to zero to avoid costs when no workflows are active.

![Architecture](assets/runners.light.png#only-light)
![Architecture](assets/runners.dark.png#only-dark)

## Motivation

GitHub Actions `self-hosted` runners provide a flexible option to run CI workloads on the infrastructure of your choice. However, currently GitHub does not provide tooling to automate the creation and scaling of action runners. This module creates the AWS infrastructure to host action runners on spot instances. It also provides lambda modules to orchestrate the lifecycle of the action runners.

Lambda was selected as the preferred runtime for two primary reasons. Firstly, it enables the development of compact components with limited access to AWS and GitHub. Secondly, it offers a scalable configuration with minimal expenses, applicable at both the repository and organizational levels. The Lambda functions will be responsible for provisioning Linux-based EC2 instances equipped with Docker to handle CI workloads compatible with Linux and/or Docker. The primary objective is to facilitate Docker-based workloads.

A pertinent question may arise: why not opt for Kubernetes? The current strategy aligns closely with the implementation of GitHub's action runners. The chosen approach involves installing the runner on a host where the necessary software is readily available, maintaining proximity to GitHub's existing practices. Another viable option could be AWS Auto Scaling groups. However, this alternative usually demands broader permissions at the instance level from GitHub. Additionally, managing the scaling process, both up and down, becomes a non-trivial task in this scenario.

## Overview

The module is designed to be used in a GitHub organization. It can also be used in a GitHub repository, but this does not support all features. The module is receiving GitHub webhook events for the `workflow_job` event. The module will create a new runner if the event is for a workflow that requires a runner, and no runner is available. Alternatively the module can be configured as ephemeral runners. In this case the module will create a new runner for each workflow job event.

As an experimental alternative, an `experimental.multi_runner_config` lane can use a [GitHub Actions runner scale set](scale-set.md). A singleton ECS/Fargate listener receives assigned-job statistics directly from GitHub and reconciles EC2 capacity without activating that lane's webhook scale-up or scheduled scale-down triggers.

For ephemeral runners a pool can be configured. The pool maintains a minimum number of runners based on a schedule. The pool works only for org level runners.

For non ephemeral runners with the idle config the module will avoid scaling down back to zero. Instead it will maintain a minimum number of runners based on a schedule. This avoids the need to scale up when a new workflow is triggered.


## Detailed design

The diagram below shows the architecture of the module, groups are indicating the different components. We will go through the components in the following sections.

![Architecture](assets/aws-architecture.light.png#only-light)
![Architecture](assets/aws-architecture.dark.png#only-dark)

### Webhook

The moment a GitHub action workflow requiring a `self-hosted` runner is triggered, GitHub will try to find a runner which can execute the workload. See [additional notes](additional_notes.md) for how the selection is made. The module can be deployed in two modes. One mode called `direct`, after accepting the [`workflow_job` event](https://docs.github.com/en/free-pro-team@latest/developers/webhooks-and-events/webhook-events-and-payloads#workflow_job) event the module will dispatch the event to a SQS queue on which the scale-up function will act. The second mode, `eventbridge` will funnel events via the AWS EventBridge. the EventBridge enables act on other events then only the `workflow_job` event with status `queued`. besides that the EventBridge supports replay functionality. For future extensions to act on events or create a data lake we will relay on the EventBridge.

For receiving the `workflow_job` event by the webhook (lambda), a webhook needs to be created in GitHub. The same app as for API calls can be used to create the webhook. Or a dedicated webhook can be defined.

- Create a GitHub app, define a webhook and subscribe the app to the `workflow_job` event.
- Create a webhook on enterprise, org or repo level, define a webhook and subscribe the app to the `workflow_job` event.

In AWS an [API gateway](https://docs.aws.amazon.com/apigateway/index.html) endpoint is created that is able to receive the GitHub webhook events via HTTP post. The gateway triggers the webhook lambda which will verify the signature of the event. This check guarantees the event is sent by the GitHub App. The lambda only handles `workflow_job` events with status `queued` and matching the runner labels. The accepted events are posted on a SQS queue. Messages on this queue will be delayed for a configurable amount of seconds (default 30 seconds) to give the available runners time to pick up this build.

### Control plane

The "Scale Up Runner" Lambda actively monitors the SQS queue, processing incoming events. The Lambda conducts a series of checks to determine the necessity of creating a new EC2 spot instance. For instance, it refrains from creating an instance if a build is already initiated by an existing runner or if the maximum allowable number of runners has been reached.

The Lambda first requests a JIT configuration or registration token from GitHub, which is needed later by the runner to register itself. This avoids the case that the EC2 instance, which later in the process will install the agent, needs administration permissions to register the runner. Next, the EC2 spot instance is created via the launch template. The launch template defines the specifications of the required instance and contains a [`user_data`](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html) script. This script will install the required software and configure it. The configuration for the runner is shared via EC2 tags and the parameter store (SSM), from which the user data script will fetch it and delete it once it has been retrieved. Once the user data script is finished, the action runner should be online, and the workflow will start in seconds.

The current method for scaling down runners employs a straightforward approach: at predefined intervals, the Lambda conducts a thorough examination of each runner (instance) to assess its activity. If a runner is found to be idle, it is deregistered from GitHub, and the associated AWS instance is terminated. For ephemeral runners the instance is terminated immediately after the workflow is finished. Instances not registered in GitHub as a runner after a minimal boot time will be marked orphan and removed in a next cycle. To avoid orphaned runners the scale down lambda is active in this case as well.

### Pool

The pool is only designed for org level runners in ephemeral mode. The pool will maintain a minimum number of runners based on a schedule. Keeping a small pool can help to start jobs faster and avoid missed events are causing long hanging jobs. The pool is opt in, it will not be created by default.

### Agent sync

To address potential delays in downloading the GitHub Action Runner distribution, a lambda function has been implemented to synchronize the action runner binary from GitHub to an S3 bucket. This ensures that the EC2 instance can retrieve the distribution from the S3 bucket, mitigating the need to rely on internet downloads, which can occasionally take more than 10 minutes. The best way to speed up instance startup is to use a pre-built AMI with the runner binary already installed. See the [examples](examples/index.md) for more details.

### SSM housekeeping

The control plane (scale up lambda) will store the runner registration configuration in the SSM parameter store. The token is stored in a secure string parameter. The token is deleted after the runner has registered itself. The token is also deleted after a configurable amount of time (default 24 hours). This house keeping ensures that your SSM parameter store does not fill up with old configuration.

### AMI cleaner

The AMI cleaner is a lambda that will clean up AMIs that are older than a configurable amount of days. This is useful when using the AMI builder to create AMIs. The cleaner will also check which AMIs are used the latest version of the launch template. And you can provide SSM config paths pointing to AMI IDs. The cleaner will not delete these AMIs. The AMI cleaner is opt in, it will not be created by default.

### Instance Termination Watcher

!!! Warning

    This feature is Beta, changes will not trigger a major release as long in beta.

The Instance Termination Watcher is creating log and optional metrics for termination of instances. Currently only spot termination warnings are watched. See [configuration](configuration/) for more details.


### Job Retry

!!! Warning

    This feature is Beta, changes will not trigger a major release as long in beta.

The Job Retry will allow you to retry scaling when a job is not started. When enabled the scale up lambda will send a retry message to the SQS queue. The Job Retry lambda will check after a delay if the job is still queued, and if so, it will send a retry command to the scale up lambda via SQS. The feature is designed to be used with ephemeral runners. The feature is opt in, it will not be created by default.

Consequences of enabling the feature are:

- Increase of calls to the GitHub API, could cause reaching the rate limit.
- Could create new instance when jobs are not started caused by other failures, resulting in more costs and useless instance creation.


### Security

Sensitive information such as secrets and private keys are stored securely in the SSM Parameter Store. These values undergo encryption using either the default KMS key for SSM or a custom KMS key, depending on the specified configuration.

Permissions are managed in several places. Below are the most important ones. For details check the Terraform sources.

- The GitHub App requires access to actions and to publish `workflow_job` events to the AWS webhook (API gateway).
- The scale up lambda should have access to EC2 for creating and tagging instances.
- The scale down lambda should have access to EC2 to terminate instances.

Besides these permissions, the lambdas also need permission to CloudWatch (for logging and scheduling), SSM and S3. For more details about the required permissions see the [documentation](modules/public/setup-iam-permissions.md) of the IAM module which uses permission boundaries.

## Terraform main modules

Currently we support two main modules. The existing `runners` module remains the stable EC2 implementation, and the `multi-runner` module creates multiple runner configurations in one deployment. Stable top-level `multi_runner_config` entries continue to use the unchanged `runners` module when `experimental.multi_runner_config` is empty. A non-empty experimental map takes priority over the stable map; the maps are not combined. Experimental entries use the new provider-oriented `runner-stack`.

Multi-runner centralizes mode selection and canonical configuration in `config.experimental.translation.tf`. A non-empty experimental lane map selects v2; otherwise the file projects the flat globals and stable lanes into the same schema. That selection produces `local.raw_translated_experimental`, from which the same file derives `local.translated_experimental_base` by applying schema defaults, global/lane precedence, tag merges, IAM ownership, paths, observability, webhook queues, and provider defaults. Provider selection and the shared runner-binary syncer and discovery use this plan-known base. After discovery, the translation file derives the final `local.translated_experimental`, including labels, runner-stack GitHub client settings, webhook queue event mapping, Lambda artifact and principals, the webhook pool Lambda wrapper, SSM KMS, and the discovered EC2 binaries object. The remaining shared components, webhook queues, and runner implementations consume that final canonical representation. Stable lanes are adapted back into the existing `module.runners["configuration"]` call, preserving their Terraform addresses while removing a second configuration path. The `module.runner_stacks` call directly iterates the gated final lanes, inlines the environment tag and live GitHub App references, adds a live build-queue reference only to `orchestration.webhook`, and forwards the complete orchestration selector and typed `compute_provider` wrapper.

The `experimental` object provides sibling global defaults through `tags`, `roles`, `runner`, `github`, `enterprise_server`, `user_agent`, `webhook`, `lambda` (including nested `scale_up`, `scale_down`, `webhook`, and `pool` settings), `queue`, `ssm`, `observability`, and `compute_provider`. These globals configure v2 runner stacks and the applicable singleton shared components. The shared GitHub App Parameter Store module, webhook, runner-binary syncer, termination watcher, and AMI housekeeper consume the translated global values. Migrated v2 consumers do not fall back to matching flat inputs; those flat values seed stable-mode translation only. Per-lane overrides remain lane-only. A nullable lane field with a corresponding experimental global inherits that global value when omitted or null. A lane that selects an external runner IAM role intentionally suppresses inherited managed policies and additional trust policy JSON because the module does not manage that role. Tag maps merge from broad to narrow. Only module naming (`prefix`), `aws_partition`, and `aws_region` remain active flat-only inputs; legacy `iam_overrides` remains in the input schema but has no active consumer.

Global `experimental.queue` owns v2 webhook build-queue defaults for delay (`30` seconds), retention (`86400` seconds), visibility (`180` seconds), redrive, tags, and encryption. Lane `experimental.multi_runner_config[].orchestration.webhook.queue` fields override the global delay, retention, visibility, redrive, and tag values; encryption remains global-only. Omitting the whole encryption block selects SQS-managed encryption and null KMS attributes. If the block is supplied explicitly, all three leaf keys are required: use a non-null `sqs_managed_sse_enabled` with null KMS fields for the non-KMS mode, or set that field to null and provide `kms_master_key_id` for KMS mode. This encryption configures only webhook-lane build queues and their dead-letter queues, not runner-stack job-retry queues, and its CMK is independent from `experimental.ssm.kms_key_id`. The current v2 webhook, scale-up, and job-retry IAM policies do not derive KMS grants from a distinct queue CMK, so callers must grant those roles the required key permissions. For v2 webhook lanes, `experimental.multi_runner_config[].orchestration.webhook.queue.visibility_timeout_seconds` must be at least six times the resolved `experimental.multi_runner_config[].orchestration.webhook.lambda.scale_up.timeout`; the Lambda timeout does not itself configure queue visibility. Scale-set lanes create no build queue. The v1 translation continues to use `runners_scale_up_lambda_timeout` and flat `queue_encryption`.

V2 requires `experimental.github.app`, and `experimental.github.additional_apps` defaults to an empty list. These nested values are authoritative end-to-end: the shared Parameter Store module persists or selects their credentials, and v2 runner stacks consume the resulting references. Flat `github_app` and `additional_github_apps` seed stable-mode translation only. `experimental.github.repository_white_list` defaults to `[]` and filters the shared webhook when populated. `experimental.enterprise_server.url` defaults to `null` and configures v2 runner-stack GitHub clients and the termination watcher. `experimental.enterprise_server.ssl_verify` and `experimental.user_agent` remain runner-stack client settings and default to `true` and `github-aws-runners`.

The shared webhook, runner-binary syncer, termination watcher, and AMI housekeeper consume global Lambda runtime, architecture, networking, role, tags, logging, and tracing settings; `lambda.principals` additionally configures runner-stack, runner-binary-syncer, termination-watcher, and AMI-housekeeper roles, but not the webhook role. Global metrics also configure the termination watcher. Runner-stack control-plane artifact selection is global under `experimental.lambda.scale.artifact`: `artifact.zip` selects a local archive, while `artifact.s3.{key,object_version}` selects an object from the shared `experimental.lambda.artifact.s3.bucket`. Leaving both artifact sources null uses the packaged runner archive. The module validates that zip and S3 are not selected together and that an S3 wrapper has a non-null shared bucket and key. Stable-mode translation preserves the legacy precedence in which a configured flat S3 bucket wins over the flat runner zip. The shared bucket alone selects no component. Each artifact-capable singleton—including the webhook—uses it only when that component's separate nested `artifact.s3` wrapper supplies its key and optional object version. The runner-binary syncer follows the same parallel selector at `experimental.compute_provider.ec2.runner_binaries.syncer.artifact.{zip,s3}`, with its S3 key and optional object version also resolved against `experimental.lambda.artifact.s3.bucket`. Root `experimental.webhook` owns queue selection, EventBridge routing, accepted event types, and matcher-parameter tier, while `lambda.webhook` owns the webhook artifact, API Gateway access logs, sizing, and component tags. `compute_provider.ec2.instance_termination_watcher`, `compute_provider.ec2.ami.housekeeper`, and `compute_provider.ec2.runner_binaries` own their singleton-specific features, artifacts, sizing, schedules, and related settings.

`experimental.compute_provider.ec2.runner_binaries.enabled` defaults each EC2 lane to the shared synchronized distribution, while a nullable lane `compute_provider.ec2.binaries_syncer.enabled` can override it. Enabled distributions are created once per unique operating-system and architecture pair. The global enable value, distribution encryption enablement, distribution KMS-key nullness, and access-logging bucket nullness must be known during planning because they determine module or resource shape. A distribution-bucket CMK grants the syncer access, but runner roles do not derive `kms:Decrypt` from that setting; attach decrypt permission to module-managed or external runner roles separately.

Global `ssm.paths.root` is the base for shared and lane-owned parameters. The shared GitHub App and webhook paths append `ssm.paths.app` (default `app`) and `ssm.paths.webhook` (default `webhook`), while normalization appends the lane key only for lane-owned paths. The default derived base is `/github-action-runners/${prefix}`, and lane token/config segments default to `runners/tokens` and `runners/config`. Global `ssm.kms_key_id` is an optional ARN-valued scalar that encrypts the shared GitHub App parameters, configures the webhook and termination watcher, and adds matching decrypt permissions to every runner stack; it does not select encryption for runtime-created lane runner parameters. IAM consumers keep a static policy shape with a harmless sentinel resource when the value is null, so a real ARN may remain unknown until apply. Nested metrics retain the established defaults: disabled, using the `GitHub Runners` namespace, with the rate-limit, job-retry, Spot-termination, and Spot-warning switches enabled. Spot metrics are global termination-watcher settings rather than lane overrides.

Each lane still selects exactly one provider and supplies provider-specific required fields with its own `compute_provider` block. The global `experimental.compute_provider` block owns shared v2 provider defaults plus the runner-binary, termination-watcher, and AMI-housekeeper singleton configuration, but it does not select a provider. The wrapped provider object reaches runner-stack, which also validates that exactly one typed block is populated before dispatch. Every stack owns SSM housekeeping plus the common runner role and attachments. A stack selected with `orchestration.webhook` also coordinates the provider-neutral scale-up, scale-down, pool, and retry modules; a stack selected with `orchestration.scale_set` creates the ECS listener instead. The EC2 provider supplies EC2-specific policy requirements and owns the instance profile, launch template, bootstrap resources, and runner log groups. These child modules are implementation details of the experimental stack and are not standalone public entry points. Later releases will route the existing v1 translation through runner-stack, ship state migration, and only then remove the v1 interface. See the [experimental compute-provider refactor](modules/internal/compute-provider-refactor.md) and [multi-runner v2 migration roadmap](modules/public/multi-runner.md#multi-runner-v2-migration-roadmap). EC2 is the only active Terraform-managed provider; microVM, CodeBuild, and other provider modules are future work.

Both modules are built on top of the same base modules. When using the multi-runner module you can deploy different runners with only one deployment.

![multi-runner](assets/multi-runner.light.png#only-light)
![multi-runner](assets/multi-runner.dark.png#only-dark)

## Recommendations

The module contains a lot of configuration options. The default values are a good starting point. But you may want to tweak some of the values. Below are some recommendations. We suggest the following configuration for the runners:

- Use the multi-runner module to create multiple runners in one go.
- Use the ephemeral runners for org level runners to improve the security of your runners.
- Use pre-built AMIs to speed up the startup of your runners.
