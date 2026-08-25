# GitHub Self-Hosted on AWS on Spot Instances

This [Terraform](https://www.terraform.io/) module creates the infrastructure needed to host [GitHub Actions](https://github.com/features/actions) self-hosted, auto-scaling runners on [AWS spot instances](https://aws.amazon.com/ec2/spot/). The stable webhook control plane manages runner lifecycle with AWS Lambda functions. Experimental multi-runner v2 can instead adopt existing GitHub runner scale sets and reconcile them through a long-running ECS service. Runners can scale down to zero when no workflows are active.

![Architecture](assets/runners.light.png#only-light)
![Architecture](assets/runners.dark.png#only-dark)

## Motivation

GitHub Actions `self-hosted` runners provide a flexible option to run CI workloads on infrastructure you control. This module creates the AWS infrastructure to host those runners on Spot instances and provides webhook-driven Lambda or experimental scale-set ECS orchestration for their lifecycle.

Lambda was selected as the preferred runtime for the webhook model for two primary reasons. Firstly, it enables the development of compact components with limited access to AWS and GitHub. Secondly, it offers a scalable configuration with minimal expenses, applicable at both the repository and organizational levels. GitHub runner scale sets require a persistent message session, so experimental v2 runs that orchestration provider as an ECS/Fargate service instead. Both models can provision Linux-based EC2 instances equipped with Docker for Linux and container workloads.

A pertinent question may arise: why not opt for Kubernetes? The current strategy aligns closely with the implementation of GitHub's action runners. The chosen approach involves installing the runner on a host where the necessary software is readily available, maintaining proximity to GitHub's existing practices. Another viable option could be AWS Auto Scaling groups. However, this alternative usually demands broader permissions at the instance level from GitHub. Additionally, managing the scaling process, both up and down, becomes a non-trivial task in this scenario.

## Overview

The module is designed to be used in a GitHub organization. It can also be used in a GitHub repository, but this does not support all features. In the stable webhook model, the module receives the `workflow_job` event and creates a runner when a matching workflow requires capacity. Alternatively, experimental v2 can reconcile demand from an existing GitHub runner scale set. Webhook orchestration supports persistent or ephemeral runners; scale-set orchestration uses fixed ephemeral JIT runners.

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

The Instance Termination Watcher creates logs and optional metrics for instance termination. Currently only Spot termination warnings are watched. In a module instance that also contains scale-set runner configs, runner deregistration must be disabled on the watcher; it can remain enabled as a logging and metrics observer while the scale-set reconciler owns GitHub runner deregistration. See [configuration](configuration/) for more details.


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
- Each scale-set controller-group task role is limited to that group's manifest path, exact GitHub App parameters and KMS keys, and the selected compute-provider capability statements.

Besides these permissions, the Lambdas also need access to CloudWatch for logging and scheduling, Parameter Store, and S3. The scale-set controller uses CloudWatch Logs, exact Parameter Store and optional KMS references, and the provider-owned capacity actions for its group. For more details about the required permissions see the [documentation](modules/public/setup-iam-permissions.md) of the IAM module which uses permission boundaries.

## Terraform main modules

Currently we support two main modules. The existing `runners` module remains the stable EC2 implementation, and the `multi-runner` module creates multiple runner configurations in one deployment. Stable top-level `multi_runner_config` entries continue to use the unchanged `runners` module when `experimental.multi_runner_config` is empty. A non-empty experimental map takes priority over the stable map; the maps are not combined. Experimental entries use the new provider-oriented `runner-config`.

Multi-runner centralizes mode selection and canonical configuration in `config.experimental.translation.tf`. A non-empty experimental runner-configuration map selects v2; otherwise the file projects the flat globals and stable runner configurations into the same schema. That selection produces `local.raw_translated_experimental`, from which the same file derives `local.translated_experimental_base` by applying schema defaults, global/runner-configuration precedence, tag merges, IAM ownership, paths, observability, webhook queues, and provider defaults. Provider selection and the shared runner-binary syncer and discovery use this plan-known base. After discovery, the translation file derives the final `local.translated_experimental`, including labels, runner-config GitHub client settings, webhook queue event mapping, Lambda artifact and principals, the webhook pool Lambda wrapper, SSM KMS, and the discovered EC2 binaries object. The remaining shared components, webhook queues, and runner implementations consume that final canonical representation. Stable runner configurations are adapted back into the existing `module.runners["configuration"]` call, preserving their Terraform addresses while removing a second configuration path. The `module.runner_configs` call iterates v2 entries and forwards the typed orchestration and compute-provider wrappers. Webhook selections receive their live App and build-queue references in the runner-config child; scale-set selections expose their compute capability to one aggregate provider call at `module.orchestration_scale_set[0]`.

The `experimental` object provides sibling global defaults through `tags`, `roles`, `runner`, `github`, `lambda`, `orchestration_provider`, `ssm`, `observability`, and `compute_provider`. Root `experimental.lambda` is provider-neutral shared Lambda substrate. `experimental.orchestration_provider.webhook` owns webhook defaults and shared routing, matcher, queue, artifact, and Lambda settings. `experimental.orchestration_provider.scale_set` owns shared controller grouping, container, manifest storage, ECS, networking, logging, and tags. Neither global block selects a provider; every runner config selects exactly one typed `webhook` or `scale_set` sibling. Webhook selections own lifecycle, capacity, registration scope, matching, queue overrides, scale, pool, and retry. Scale-set selections own GitHub scope, the installation-ID reference, existing scale-set identity, desired capacity, and boot timeout.

Multi-runner makes one aggregated scale-set provider call for every selected scale-set runner config. The default grouping creates one ECS service per compute-provider type; `runner_config` grouping creates one per runner config, and `custom` grouping maps selected runner configs into explicit groups. Each group normally runs one task, one controller, and one reconciler per scale set. See [Runner scale-set controller](scale-set.md) for the deployment and ownership contract. Migrated v2 consumers do not fall back to matching flat inputs; flat values seed stable-mode translation only. A runner configuration that selects an external runner IAM role suppresses inherited managed policies and additional trust policy JSON because the module does not manage that role. Tag maps merge from broad to narrow. Only module naming (`prefix`), `aws_partition`, and `aws_region` remain active flat-only inputs; legacy `iam_overrides` remains in the input schema but has no active consumer.

Global `experimental.orchestration_provider.webhook.queue` owns v2 defaults for build-queue delay (`30` seconds), retention (`86400` seconds), visibility (`180` seconds), redrive, tags, and encryption. Runner-configuration `experimental.multi_runner_config[].orchestration_provider.webhook.queue` fields override the global delay, retention, visibility, redrive, and tag values; encryption remains global-only. Omitting the whole encryption block selects SQS-managed encryption and null KMS attributes. If the block is supplied explicitly, all three leaf keys are required: use a non-null `sqs_managed_sse_enabled` with null KMS fields for the non-KMS mode, or set that field to null and provide `kms_master_key_id` for KMS mode. This encryption configures the multi-runner build queues and their dead-letter queues, not the webhook provider's separate job-retry queue, and its CMK is independent from `experimental.ssm.kms_key_id`. Runner-config forwards the distinct build-queue key to the webhook orchestration provider: scale-up receives `kms:Decrypt`, while job-retry receives `kms:Decrypt` and `kms:GenerateDataKey` for publishing. The existing shared `modules/webhook` contract remains unchanged and still requires caller-supplied key access when that publisher targets customer-managed encrypted queues. For v2, `experimental.multi_runner_config[].orchestration_provider.webhook.queue.visibility_timeout_seconds` must be at least six times the resolved `experimental.multi_runner_config[].orchestration_provider.webhook.lambda.scale.up.timeout`; the Lambda timeout does not itself configure queue visibility. The v1 translation continues to use `runners_scale_up_lambda_timeout` and flat `queue_encryption`.

V2 requires `experimental.github.app`, and `experimental.github.additional_apps` defaults to an empty list. These nested values are authoritative end-to-end: the shared Parameter Store module persists or selects their credentials, and v2 runner configurations consume the resulting references. Scale-set orchestration always uses the primary App ID and private-key references from `experimental.github.app`; it does not select from `additional_apps`. Every scale-set runner config provides its own `orchestration_provider.scale_set.github.installation_id_ssm` name and ARN, plus an optional KMS key ARN. Manifests contain only Parameter Store references, never credential values. Flat `github_app` and `additional_github_apps` seed stable-mode translation only. `experimental.orchestration_provider.webhook.github.repository_white_list` defaults to `[]` and filters the shared webhook when populated. `experimental.github.enterprise_server.url` defaults to `null` and configures v2 runner-config GitHub clients and the termination watcher. `experimental.github.enterprise_server.ssl_verify` and `experimental.github.user_agent` remain runner-config client settings and default to `true` and `github-aws-runners`. The scale-set service scopes disabled TLS verification to each reconciler and uses the configured user agent as the `system` identity inside GitHub's structured scale-set protocol header. Both settings belong inside `experimental.github`; they are not root `experimental` fields or per-configuration orchestration settings.

The shared webhook, runner configurations, SSM housekeepers, runner-binary syncer, termination watcher, and AMI housekeeper consume the provider-neutral runtime, architecture, networking, role, and tag defaults under `experimental.lambda`; `lambda.principals` configures runner-config, runner-binary-syncer, termination-watcher, and AMI-housekeeper roles, but not the webhook role. Global observability settings configure logging and tracing, and global metrics also configure the termination watcher. The runner-control artifact shared by webhook scale, pool, and job-retry is selected globally under `experimental.orchestration_provider.webhook.lambda.artifact`: `artifact.zip` selects a local archive, while `artifact.s3.{key,object_version}` selects an object from the shared `experimental.lambda.artifact.s3.bucket`. Leaving both artifact sources null uses the packaged runner archive. The module validates that zip and S3 are not selected together and that an S3 wrapper has a non-null shared bucket and key. Stable-mode translation preserves the legacy precedence in which a configured flat S3 bucket wins over the flat runner zip. The shared bucket alone selects no component. Each artifact-capable singleton—including the webhook—uses it only when that component's separate nested `artifact.s3` wrapper supplies its key and optional object version. Runner-config's common SSM housekeeper independently resolves `multi_runner_config[].ssm.housekeeper.lambda.artifact` over the global `experimental.ssm.housekeeper.lambda.artifact`; S3 combines the component key and version with the shared artifact bucket, zip uses the selected local path, and no selection uses the packaged control-plane archive. The runner-binary syncer follows the same parallel selector at `experimental.compute_provider.aws.ec2.runner_binaries.syncer.artifact.{zip,s3}`, with its S3 key and optional object version also resolved against `experimental.lambda.artifact.s3.bucket`. `experimental.orchestration_provider.webhook` owns queue selection, EventBridge routing, accepted event types, and matcher-parameter tier, while `experimental.orchestration_provider.webhook.lambda.webhook` owns the separate ingress webhook artifact, API Gateway access logs, sizing, and component tags. `compute_provider.aws.ec2.instance_termination_watcher`, `compute_provider.aws.ec2.ami.housekeeper`, and `compute_provider.aws.ec2.runner_binaries` own their singleton-specific features, artifacts, sizing, schedules, and related settings.

`experimental.compute_provider.aws.ec2.runner_binaries.enabled` defaults each EC2 runner configuration to the shared synchronized distribution, while a nullable per-configuration `compute_provider.aws.ec2.binaries_syncer.enabled` can override it. Enabled distributions are created once per unique operating-system and architecture pair. The global enable value, distribution encryption enablement, distribution KMS-key nullness, and access-logging bucket nullness must be known during planning because they determine module or resource shape. A distribution-bucket CMK grants the syncer access, but runner roles do not derive `kms:Decrypt` from that setting; attach decrypt permission to module-managed or external runner roles separately.

Global `ssm.paths.root` is the base for shared and runner-configuration-owned parameters. The shared GitHub App and webhook paths append `ssm.paths.app` (default `app`) and `ssm.paths.webhook` (default `webhook`), while normalization appends the runner-configuration key only for configuration-owned paths. The default derived base is `/github-action-runners/${prefix}`, and runner token/config segments default to `runners/tokens` and `runners/config`. Global `ssm.kms_key_id` is an optional ARN-valued scalar that encrypts the shared GitHub App parameters, configures the webhook, and adds matching decrypt permissions to every runner configuration; it does not select encryption for runtime-created runner parameters. Webhook-provider leaves conditionally omit their KMS statements when this value is null, while apply-time-unknown key ARNs remain valid during planning. Nested metrics retain the established defaults: disabled, using the `GitHub Runners` namespace, with the rate-limit, job-retry, Spot-termination, and Spot-warning switches enabled. Spot metrics are global termination-watcher settings rather than per-configuration overrides.

Each runner configuration selects two independent typed providers: one `orchestration_provider` for demand control and one namespaced `compute_provider` for runner capacity. V2 supports `orchestration_provider.webhook` and `orchestration_provider.scale_set`; the only selectable compute leaf is currently `compute_provider.aws.ec2`. The wrapped objects reach runner-config, which validates each exact-one selection and dispatches the selected compute provider plus per-runner webhook orchestration when applicable. Scale-set orchestration is aggregated at multi-runner scope so grouping can span runner configs.

The scale-set provider adopts existing GitHub scale sets and never discovers, creates, or deletes them. A canonical GitHub scope plus numeric scale-set ID must be unique across all deployments that can reach that scope; Terraform can reject duplicates only inside its own module instance. Scale-set-created EC2 instances are tagged `ghr:created_by=scale-set-service` and owned by their scale-set reconciler. The shared termination watcher may coexist only as a logging and metrics observer with runner deregistration disabled.

The EC2 implementation lives under `compute-providers/aws/ec2`, supplies provider-specific policy and scale-set capability requirements, and owns the instance profile, launch template, bootstrap resources, and runner log groups. Runner-config dispatches it at `module.compute_aws_ec2[0]` and exposes resources under `provider.aws.ec2` (for multi-runner, `runners_map_v2["<runner_config>"].provider.aws.ec2`). Declarative moved blocks preserve state created at the earlier experimental `module.compute_ec2[0]` and `module.compute_ec2_trust_policy[0]` child addresses. They do not migrate stable-v1 `module.runners` state to v2 or rewrite consumer references from `provider.ec2` to `provider.aws.ec2`. These modules remain internal experimental boundaries. See the [experimental orchestration- and compute-provider refactor](modules/internal/compute-provider-refactor.md), [runner scale-set controller](scale-set.md), and [multi-runner v2 migration roadmap](modules/public/multi-runner.md#multi-runner-v2-migration-roadmap). EC2 is the only active Terraform-managed compute provider; MicroVM, CodeBuild, and other compute providers remain future work.

Both modules are built on top of the same base modules. When using the multi-runner module you can deploy different runners with only one deployment.

![multi-runner](assets/multi-runner.light.png#only-light)
![multi-runner](assets/multi-runner.dark.png#only-dark)

## Recommendations

The module contains a lot of configuration options. The default values are a good starting point. But you may want to tweak some of the values. Below are some recommendations. We suggest the following configuration for the runners:

- Use the multi-runner module to create multiple runners in one go.
- Use the ephemeral runners for org level runners to improve the security of your runners.
- Use pre-built AMIs to speed up the startup of your runners.
