variable "experimental" {
  description = <<-EOT
    Opt-in experimental features. Omit this object to retain only the stable `multi_runner_config` behavior. Experimental schemas can change before they become stable.

    Set `experimental.multi_runner_config` to opt into provider-oriented runner configurations. A non-empty experimental map completely replaces the stable top-level `multi_runner_config`; an empty map keeps stable entries on the unchanged `runners` module.

    Sibling blocks provide global v2 defaults. Global and per-configuration values use `configuration override > experimental global v2 default` precedence. Migrated v2 consumers do not inherit a matching flat module input. Singleton shared components consume the global translated values documented below; per-configuration overrides affect only their runner configuration. Component-specific inputs without a nested counterpart continue consuming their existing flat inputs. Tag maps merge from broad to narrow instead of replacing the broader map.
    Nullable per-configuration values inherit their experimental global value, so only defaults that apply to every runner configuration should be placed in a global block. When a runner configuration selects an external `runner.iam.role`, inherited managed policies and additional trust policy JSON are intentionally suppressed because this module does not manage that role.
    Plan-shaping ownership wrappers remain nullable where their object presence controls Terraform graph shape. `ssm.kms_key_id` is instead an ARN-valued scalar; provider-owned IAM omits null KMS statements while still accepting an ARN whose value is unknown until apply. The unchanged shared webhook retains its legacy policy handling.

    Global experimental fields support the following nested properties. These values apply directly when `experimental.multi_runner_config` is non-empty; in stable mode, flat inputs are translated into the same global shape.

    - `tags`: Base tags for v2 build queues, runner configurations, the shared GitHub App Parameter Store module, webhook, runner-binary syncer, termination watcher, and AMI housekeeper. The default is `{}`.
    - `roles.path`: Default IAM path for module-managed v2 runner and Lambda roles and for the shared webhook, runner-binary syncer, termination-watcher, and AMI-housekeeper Lambda roles. The default is null.
    - `roles.permissions_boundary`: Default permissions-boundary ARN for module-managed v2 runner and Lambda roles and for the shared webhook, runner-binary syncer, termination-watcher, and AMI-housekeeper Lambda roles. The default is null.
    - `runner.os`: Default runner operating system. The default is null; every runner configuration must resolve this field globally or locally.
    - `runner.architecture`: Default runner distribution architecture. The default is null; every runner configuration must resolve this field globally or locally.
    - `runner.disable_default_labels`: Omits the default self-hosted, operating-system, and architecture labels when true. The default is `false`.
    - `runner.extra_labels`: Default additional labels combined with each runner configuration's matcher labels. The default is `[]`.
    - `runner.group_name`: Default GitHub runner group. The default is `Default`.
    - `runner.name_prefix`: Default prefix added to registered runner names. The default is an empty string.
    - `runner.run_as_root`: Runs the runner service as root when supported by the provider. The default is `false`.
    - `runner.run_as`: Default operating-system user when `run_as_root` is false. The default is `ec2-user`.
    - `runner.auto_update_disabled`: Disables the GitHub runner application's built-in updater. The default is `false`.
    - `runner.tags`: Default tags for common runner resources, currently the module-managed runner IAM role. The default is `{}`.
    - `runner.hooks.job_started`: Default script content installed as the runner job-started hook. The default is an empty string.
    - `runner.hooks.job_completed`: Default script content installed as the runner job-completed hook. The default is an empty string.
    - `runner.iam.role`: Optional externally managed runner-role wrapper. The default is null; wrapper presence selects external role ownership during planning.
    - `runner.iam.role.arn`: ARN of the externally managed runner role.
    - `runner.iam.managed_policy_arns`: Named managed-policy ARNs attached to module-managed runner roles. The default is `{}`. Keep this map empty when the global `runner.iam.role` selects an external role; a runner configuration that explicitly selects its own external role suppresses the inherited map.
    - `runner.iam.additional_trust_policy_json`: Optional IAM policy document merged with the provider trust policy for module-managed runner roles. The default is null. Keep it null when the global `runner.iam.role` selects an external role; a runner configuration that explicitly selects its own external role suppresses the inherited value.
    - `runner.iam.path`: Runner-role IAM path. The default is null, which falls back to `roles.path`.
    - `runner.iam.permissions_boundary`: Runner-role permissions-boundary ARN. The default is null, which falls back to `roles.permissions_boundary`.
    - `github.app`: Primary GitHub App credentials persisted or selected by the shared Parameter Store module and used by v2 runner configurations. The default is null, but a non-empty v2 map requires this object.
    - `github.app.key_base64`: Base64-encoded GitHub App private key supplied directly.
    - `github.app.key_base64_ssm`: Existing Parameter Store private-key parameter wrapper. Set this or `key_base64`.
    - `github.app.key_base64_ssm.arn`: ARN of the existing private-key parameter.
    - `github.app.key_base64_ssm.name`: Name of the existing private-key parameter.
    - `github.app.id`: GitHub App ID supplied directly.
    - `github.app.id_ssm`: Existing Parameter Store app-ID parameter wrapper. Set this or `id`.
    - `github.app.id_ssm.arn`: ARN of the existing app-ID parameter.
    - `github.app.id_ssm.name`: Name of the existing app-ID parameter.
    - `github.app.webhook_secret`: GitHub App webhook secret supplied directly.
    - `github.app.webhook_secret_ssm`: Existing Parameter Store webhook-secret parameter wrapper. Set this or `webhook_secret`.
    - `github.app.webhook_secret_ssm.arn`: ARN of the existing webhook-secret parameter.
    - `github.app.webhook_secret_ssm.name`: Name of the existing webhook-secret parameter.
    - `github.additional_apps`: Additional GitHub App credentials persisted or selected by the shared Parameter Store module and used for API request distribution. The default is `[]`.
    - `github.additional_apps[].key_base64`: Base64-encoded private key supplied directly for an additional app.
    - `github.additional_apps[].key_base64_ssm`: Existing Parameter Store private-key parameter wrapper. Set this or `key_base64`.
    - `github.additional_apps[].key_base64_ssm.arn`: ARN of the existing additional-app private-key parameter.
    - `github.additional_apps[].key_base64_ssm.name`: Name of the existing additional-app private-key parameter.
    - `github.additional_apps[].id`: Additional GitHub App ID supplied directly.
    - `github.additional_apps[].id_ssm`: Existing Parameter Store app-ID parameter wrapper. Set this or `id`.
    - `github.additional_apps[].id_ssm.arn`: ARN of the existing additional-app ID parameter.
    - `github.additional_apps[].id_ssm.name`: Name of the existing additional-app ID parameter.
    - `github.additional_apps[].installation_id`: Optional installation ID supplied directly for an additional app.
    - `github.additional_apps[].installation_id_ssm`: Optional existing Parameter Store installation-ID parameter wrapper.
    - `github.additional_apps[].installation_id_ssm.arn`: ARN of the existing installation-ID parameter.
    - `github.additional_apps[].installation_id_ssm.name`: Name of the existing installation-ID parameter.
    - `github.enterprise_server.url`: GitHub Enterprise Server URL used by v2 runner-config GitHub clients and the shared termination watcher. The default is null.
    - `github.enterprise_server.ssl_verify`: Enables TLS certificate verification for v2 runner-config GitHub clients. The default is `true`.
    - `github.user_agent`: HTTP User-Agent used by v2 runner-config GitHub clients. The default is `github-aws-runners`.
    - `lambda.artifact.s3.bucket`: Optional shared S3 bucket containing Lambda deployment artifacts for v2 runner configurations and their SSM housekeepers, the webhook, runner-binary syncer, termination watcher, and AMI housekeeper. The default is null. A component selects an object from this bucket only when its own `artifact.s3` wrapper is present.
    - `lambda.runtime`: Runtime for v2 runner-config functions and the shared webhook, runner-binary syncer, termination watcher, and AMI housekeeper. The default is `nodejs24.x`.
    - `lambda.architecture`: Architecture for v2 runner-config functions and the shared webhook, runner-binary syncer, termination watcher, and AMI housekeeper. The default is `arm64`.
    - `lambda.principals`: Additional principals allowed to assume v2 runner-config, runner-binary syncer, termination-watcher, and AMI-housekeeper Lambda roles. The default is `[]`; list membership must be known during planning because it creates IAM principal blocks.
    - `lambda.principals[].type`: IAM principal type.
    - `lambda.principals[].identifiers`: IAM principal identifiers for the type.
    - `lambda.subnet_ids`: Subnets for v2 runner-config functions and the shared webhook, runner-binary syncer, termination watcher, and AMI housekeeper. The default is `[]`.
    - `lambda.security_group_ids`: Security groups for v2 runner-config functions and the shared webhook, runner-binary syncer, termination watcher, and AMI housekeeper. The default is `[]`.
    - `lambda.tags`: Default tags for v2 runner-config functions and the shared webhook, runner-binary syncer, termination watcher, and AMI housekeeper. The default is `{}`.
    - `lambda.role.path`: IAM path for module-managed v2 Lambda roles and the shared webhook, runner-binary syncer, termination-watcher, and AMI-housekeeper roles. The default is null, which falls back to `roles.path`.
    - `lambda.role.permissions_boundary`: Permissions-boundary ARN for module-managed v2 Lambda roles and the shared webhook, runner-binary syncer, termination-watcher, and AMI-housekeeper roles. The default is null, which falls back to `roles.permissions_boundary`.
    - `orchestration_provider.webhook`: Global defaults for the workflow-job webhook control plane. This is a defaults namespace; every runner configuration still selects its demand controller independently under `multi_runner_config[].orchestration_provider`, where exactly one typed provider block must be non-null.
    - `orchestration_provider.webhook.queue_selection_strategy`: Queue-selection strategy when multiple runner configurations match a job equally well. The default is `first`, which deterministically selects the first matching queue by priority. `random` spreads jobs across equally matched queues. `all` dispatches to every matching queue, favoring startup speed at the cost of multiple runner launches and registrations for one job.
    - `orchestration_provider.webhook.eventbridge.enable`: Routes accepted webhook events through EventBridge when true. The default is `true`, and the value must be known during planning because it selects the webhook implementation.
    - `orchestration_provider.webhook.eventbridge.accept_events`: EventBridge event types accepted by the shared webhook. The default is `[]`, which accepts all supported events.
    - `orchestration_provider.webhook.matcher_config_parameter_store_tier`: Parameter Store tier for the shared matcher configuration. The default is `Standard`; valid values are `Standard` and `Advanced`. The value must be known during planning because it determines the matcher-parameter chunks.
    - `orchestration_provider.webhook.github.repository_white_list`: Repository full names allowed to use the shared webhook. The default is `[]`, which disables repository filtering.
    - `orchestration_provider.webhook.runner.boot_time_in_minutes`: Default expected runner boot duration used by webhook scale-down and pool controls. The default is `5`.
    - `orchestration_provider.webhook.runner.ephemeral`: Registers webhook-orchestrated runners in ephemeral mode by default. The default is `false`.
    - `orchestration_provider.webhook.runner.jit_config_enabled`: Explicit default for just-in-time runner configuration. The default is null, which follows the resolved `ephemeral` mode.
    - `orchestration_provider.webhook.runner.maximum_count`: Default maximum number of runners managed by the webhook orchestration provider per runner configuration. The default is null; every webhook runner configuration must resolve this field globally or locally.
    - `orchestration_provider.webhook.lambda.artifact`: Shared runner-control-plane artifact used by webhook scale, pool, and job-retry components. Set at most one of `zip` or `s3`; when both are null, the packaged runner archive is used.
    - `orchestration_provider.webhook.lambda.artifact.zip`: Optional local path to the shared runner-control-plane Lambda archive. The default is null.
    - `orchestration_provider.webhook.lambda.artifact.s3`: Optional key and object version in the shared `lambda.artifact.s3.bucket`. Wrapper presence selects S3 for runner-control-plane Lambdas, must be known during planning, and requires a non-null shared bucket and key.
    - `orchestration_provider.webhook.lambda.artifact.s3.key`: Object key of the shared runner-control-plane Lambda archive.
    - `orchestration_provider.webhook.lambda.artifact.s3.object_version`: Optional object version of the shared runner-control-plane Lambda archive. The default is null.
    - `orchestration_provider.webhook.lambda.scale.up.memory_size`: Scale-up Lambda memory in MB. The default is `512`.
    - `orchestration_provider.webhook.lambda.scale.up.timeout`: Scale-up Lambda timeout in seconds. The default is `30`.
    - `orchestration_provider.webhook.lambda.scale.up.reserved_concurrent_executions`: Reserved concurrency for scale-up. The default is `1`; use `-1` for unreserved concurrency.
    - `orchestration_provider.webhook.lambda.scale.up.job_queued_check_enabled`: Enables queued-job verification before scaling. The default is null, which follows the resolved runner mode.
    - `orchestration_provider.webhook.lambda.scale.up.event_source_mapping.batch_size`: Maximum build-queue records delivered per scale-up invocation. The default is `10`.
    - `orchestration_provider.webhook.lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds`: Maximum build-queue batching window. The default is `0`.
    - `orchestration_provider.webhook.lambda.scale.up.tags`: Default tags for scale-up resources. The default is `{}`.
    - `orchestration_provider.webhook.lambda.scale.down.memory_size`: Scale-down Lambda memory in MB. The default is `512`.
    - `orchestration_provider.webhook.lambda.scale.down.timeout`: Scale-down Lambda timeout in seconds. The default is `60`.
    - `orchestration_provider.webhook.lambda.scale.down.schedule_expression`: EventBridge schedule for scale-down. The default is `cron(*/5 * * * ? *)`.
    - `orchestration_provider.webhook.lambda.scale.down.minimum_running_time_in_minutes`: Minimum runner age before scale-down may terminate it. The default is null, which selects the operating-system default.
    - `orchestration_provider.webhook.lambda.scale.down.idle_config`: Default time-based desired idle-runner configurations. The default is `[]`.
    - `orchestration_provider.webhook.lambda.scale.down.idle_config[].cron`: Cron expression identifying when the idle configuration applies.
    - `orchestration_provider.webhook.lambda.scale.down.idle_config[].timeZone`: IANA time zone used to evaluate the cron expression.
    - `orchestration_provider.webhook.lambda.scale.down.idle_config[].idleCount`: Number of idle runners retained during the matching period.
    - `orchestration_provider.webhook.lambda.scale.down.idle_config[].evictionStrategy`: Selection strategy used when excess idle runners are removed. The default is `oldest_first`.
    - `orchestration_provider.webhook.lambda.scale.down.tags`: Default tags for scale-down resources. The default is `{}`.
    - `orchestration_provider.webhook.lambda.webhook.artifact`: Shared-webhook artifact selection. Set at most one of `zip` or `s3`; when both are null, the packaged archive is used.
    - `orchestration_provider.webhook.lambda.webhook.artifact.zip`: Optional local path to the shared-webhook Lambda archive. The default is null.
    - `orchestration_provider.webhook.lambda.webhook.artifact.s3`: Optional key and object version in the shared `lambda.artifact.s3.bucket`. Wrapper presence selects S3 for the webhook and requires a non-null shared bucket and key.
    - `orchestration_provider.webhook.lambda.webhook.artifact.s3.key`: Object key of the shared-webhook Lambda archive.
    - `orchestration_provider.webhook.lambda.webhook.artifact.s3.object_version`: Optional object version of the shared-webhook Lambda archive. The default is null.
    - `orchestration_provider.webhook.lambda.webhook.api_gateway_access_log_settings`: Optional API Gateway access-log destination and format for the shared webhook. The default is null, and wrapper presence must be known during planning because it controls the access-log block.
    - `orchestration_provider.webhook.lambda.webhook.api_gateway_access_log_settings.destination_arn`: CloudWatch Logs destination ARN for API Gateway access logs.
    - `orchestration_provider.webhook.lambda.webhook.api_gateway_access_log_settings.format`: API Gateway access-log format.
    - `orchestration_provider.webhook.lambda.webhook.memory_size`: Shared-webhook Lambda memory in MB. The default is `256`.
    - `orchestration_provider.webhook.lambda.webhook.timeout`: Shared-webhook Lambda timeout in seconds. The default is `10`.
    - `orchestration_provider.webhook.lambda.webhook.tags`: Additional tags for the shared webhook Lambda, merged after `lambda.tags`. The default is `{}`.
    - `orchestration_provider.webhook.lambda.pool.memory_size`: Pool Lambda memory in MB. The default is `512`.
    - `orchestration_provider.webhook.lambda.pool.timeout`: Pool Lambda timeout in seconds. The default is `60`.
    - `orchestration_provider.webhook.lambda.pool.reserved_concurrent_executions`: Reserved concurrency for the pool Lambda. The default is `1`; use `-1` for unreserved concurrency.
    - `orchestration_provider.webhook.lambda.pool.config`: Default scheduled target pool sizes. The default is `[]`, which disables the pool component.
    - `orchestration_provider.webhook.lambda.pool.config[].schedule_expression`: Scheduler expression that activates the target size.
    - `orchestration_provider.webhook.lambda.pool.config[].schedule_expression_timezone`: Optional IANA time zone used to evaluate the schedule.
    - `orchestration_provider.webhook.lambda.pool.config[].size`: Desired runner-pool size for the schedule.
    - `orchestration_provider.webhook.lambda.pool.include_busy_runners`: Includes busy runners when reconciling scheduled pool capacity. The default is `false`.
    - `orchestration_provider.webhook.lambda.pool.runner_owner`: Optional GitHub organization or repository owner used for pooled runners. The default is null.
    - `orchestration_provider.webhook.lambda.pool.tags`: Default tags for pool resources. The default is `{}`.
    - `orchestration_provider.webhook.queue.delay_webhook_event`: Default delay in seconds applied to accepted webhook jobs. The default is `30`.
    - `orchestration_provider.webhook.queue.job_queue_retention_in_seconds`: Default build-queue message retention period in seconds. The default is `86400`.
    - `orchestration_provider.webhook.queue.visibility_timeout_seconds`: Default build-queue visibility timeout. The default is `180`; set it to at least six times every resolved `orchestration_provider.webhook.lambda.scale.up.timeout` that inherits it.
    - `orchestration_provider.webhook.queue.redrive_build_queue.enabled`: Creates and attaches a dead-letter queue to every v2 build queue by default. The default is `false`.
    - `orchestration_provider.webhook.queue.redrive_build_queue.maxReceiveCount`: Default number of receives before a message moves to the dead-letter queue. The default is null while redrive is disabled and must resolve to a value greater than zero when redrive is enabled.
    - `orchestration_provider.webhook.queue.tags`: Default tags for v2 build queues and dead-letter queues. The default is `{}`.
    - `orchestration_provider.webhook.queue.encryption`: Global at-rest encryption configuration for the multi-runner build queues and their dead-letter queues. It does not configure runner-config job-retry queues. Omitting the whole block selects SQS-managed encryption and defaults the two KMS attributes to null. When supplying the block explicitly, provide all three leaf attributes and use null for the inactive mode.
    - `orchestration_provider.webhook.queue.encryption.kms_data_key_reuse_period_seconds`: KMS data-key reuse period in seconds. This key is required syntactically in an explicit `queue.encryption` object but may be null; it is used only with `kms_master_key_id`.
    - `orchestration_provider.webhook.queue.encryption.kms_master_key_id`: KMS key ARN used for queue encryption. This AWS-facing field name is retained for compatibility, but non-null values must be key ARNs because runner-config IAM policies cannot use key IDs or aliases as resources. The field is required syntactically in an explicit `queue.encryption` object but may be null, and a computed ARN may remain unknown until apply. It is independent from `ssm.kms_key_id` and is forwarded separately to each webhook runner configuration so runner-config scale-up and job-retry roles receive only the build-queue KMS permissions they require.
    - `orchestration_provider.webhook.queue.encryption.sqs_managed_sse_enabled`: Selects the non-KMS mode: `true` enables SQS-managed encryption and `false` explicitly disables queue encryption. This key is required syntactically in an explicit `queue.encryption` object and must be null when `kms_master_key_id` is set. Omitting the whole encryption block defaults it to `true`.
    - `ssm.paths.root`: Base Parameter Store path for shared GitHub App and webhook parameters and for all v2 runner configurations. The schema default is null, which derives `/github-action-runners/<prefix>`; normalization appends the configuration key only for configuration-owned paths.
    - `ssm.paths.app`: Shared GitHub App credential path segment below `ssm.paths.root`. The default is `app`.
    - `ssm.paths.webhook`: Shared webhook matcher-configuration path segment below `ssm.paths.root`. The default is `webhook`.
    - `ssm.paths.tokens`: Runner registration-token and JIT-configuration path segment below each runner-configuration root. The default is `runners/tokens`.
    - `ssm.paths.config`: Persistent runner-configuration path segment below each runner-configuration root. The default is `runners/config`.
    - `ssm.kms_key_id`: Optional global KMS key ARN that encrypts shared GitHub App parameters, configures the webhook and termination watcher, and adds matching decrypt permissions to every v2 runner configuration. The default is null and its value may be unknown until apply. It does not select encryption for runtime-created runner-configuration parameters.
    - `ssm.tags`: Default tags for the shared GitHub App Parameter Store module and runner-configuration-owned SSM resources. The default is `{}`.
    - `ssm.parameters.tags`: Default tags for Terraform-managed and runtime-created runner-configuration parameters. The default is `{}`.
    - `ssm.housekeeper.schedule_expression`: Default EventBridge schedule for each runner-configuration SSM housekeeper. The default is `rate(1 day)`.
    - `ssm.housekeeper.state`: Default EventBridge rule state for each runner-configuration SSM housekeeper. The default is `ENABLED`.
    - `ssm.housekeeper.tags`: Default tags for SSM housekeeper resources. The default is `{}`.
    - `ssm.housekeeper.lambda.artifact`: Default SSM-housekeeper artifact selection. Set at most one of `zip` or `s3`; when both are null, runner-config uses its packaged runner control-plane archive.
    - `ssm.housekeeper.lambda.artifact.zip`: Optional local path to the SSM-housekeeper Lambda archive. The default is null.
    - `ssm.housekeeper.lambda.artifact.s3`: Optional key and object version in the shared `lambda.artifact.s3.bucket`. Wrapper presence selects S3 for the SSM housekeeper, must be known during planning, and requires a non-null shared bucket and key.
    - `ssm.housekeeper.lambda.artifact.s3.key`: Object key of the SSM-housekeeper Lambda archive.
    - `ssm.housekeeper.lambda.artifact.s3.object_version`: Optional object version of the SSM-housekeeper Lambda archive. The default is null.
    - `ssm.housekeeper.lambda.memory_size`: Default SSM housekeeper Lambda memory in MB. The default is `512`.
    - `ssm.housekeeper.lambda.timeout`: Default SSM housekeeper Lambda timeout in seconds. The default is `60`.
    - `ssm.housekeeper.config.tokenPath`: Optional cleanup path shared by every runner configuration. The default is null; omit it so each runner configuration derives its isolated token path.
    - `ssm.housekeeper.config.minimumDaysOld`: Minimum parameter age in days before deletion is allowed. The default is `1`.
    - `ssm.housekeeper.config.dryRun`: Reports eligible parameters without deleting them when true. The default is `false`.
    - `observability.logs.level`: Application log level for v2 runner-config functions and the shared webhook, runner-binary syncer, termination watcher, and AMI housekeeper. The default is `info`.
    - `observability.logs.retention_in_days`: CloudWatch Logs retention for v2 runner-config resources and the shared webhook, runner-binary syncer, termination watcher, and AMI housekeeper. The default is `180`.
    - `observability.logs.kms_key_id`: Optional KMS key ID or ARN for v2 runner-config log groups and the shared webhook, runner-binary syncer, termination watcher, and AMI housekeeper. The default is null.
    - `observability.logs.class`: CloudWatch log-group class for v2 runner-config resources and the shared webhook, runner-binary syncer, termination watcher, and AMI housekeeper. The default is `STANDARD`.
    - `observability.logs.tags`: Default tags for v2 runner-config log groups. The default is `{}`; shared singleton functions receive `tags` and `lambda.tags` instead.
    - `observability.tracing.mode`: Optional Lambda tracing mode for v2 runner-config functions and the shared webhook, runner-binary syncer, termination watcher, and AMI housekeeper. The default is null; its nullness must be known during planning because it controls X-Ray IAM and tracing blocks.
    - `observability.tracing.capture_http_requests`: Enables HTTP request capture in the tracing helper for v2 runner-config functions and translated shared consumers. The default is `false`.
    - `observability.tracing.capture_error`: Enables error capture in the tracing helper for v2 runner-config functions and translated shared consumers. The default is `false`.
    - `observability.metrics.enable`: Enables module-emitted metrics for v2 runner configurations and the shared termination watcher. The default is `false`.
    - `observability.metrics.namespace`: CloudWatch namespace for v2 runner-config and termination-watcher metrics. The default is `GitHub Runners`.
    - `observability.metrics.metric.enable_github_app_rate_limit`: Emits GitHub App rate-limit metrics when metrics are enabled. The default is `true`.
    - `observability.metrics.metric.enable_job_retry`: Emits job-retry metrics when metrics are enabled. The default is `true`.
    - `observability.metrics.metric.enable_spot_termination`: Emits Spot termination metrics from the shared termination watcher when metrics are enabled. The default is `true`.
    - `observability.metrics.metric.enable_spot_termination_warning`: Emits Spot termination-warning metrics from the shared termination watcher when metrics are enabled. The default is `true`.
    - `compute_provider`: Shared compute-provider defaults grouped first by cloud and then by provider type. Global defaults do not select a provider for any runner configuration.
    - `compute_provider.selections`: Optional plan-shaping map keyed by runner-configuration key. Each entry identifies the namespace and type of the configuration's selected compute-provider block. The default is null, which discovers selections from the typed provider blocks. Set this map when unrelated apply-time values make that discovery unknown; its keys and values must be known during planning and cover every runner configuration exactly once.
    - `compute_provider.selections[].namespace`: Compute-provider namespace. The only currently supported value is `aws`.
    - `compute_provider.selections[].type`: Compute-provider type within the namespace. Currently supported values are `ec2` and `microvm`.
    - `compute_provider.aws`: Shared defaults for AWS compute providers.
    - `compute_provider.aws.ec2`: Shared defaults for AWS EC2 runner configurations.
    - `compute_provider.aws.ec2.vpc_id`: Shared VPC default for v2 EC2 runner configurations. The default is null; every EC2 runner configuration must resolve this field globally or locally.
    - `compute_provider.aws.ec2.subnet_ids`: Shared subnet default for v2 EC2 runner configurations. The default is null; every EC2 runner configuration must resolve this field globally or locally.
    - `compute_provider.aws.ec2.managed_security_group_enabled`: Creates the module-managed runner security group by default. The default is `true`.
    - `compute_provider.aws.ec2.egress_rules`: Shared runner security-group egress rules. The default is one IPv4/IPv6 allow-all rule; v2 does not inherit flat `runner_egress_rules`.
    - `compute_provider.aws.ec2.egress_rules[].cidr_blocks`: IPv4 CIDR destinations for an egress rule.
    - `compute_provider.aws.ec2.egress_rules[].ipv6_cidr_blocks`: IPv6 CIDR destinations for an egress rule.
    - `compute_provider.aws.ec2.egress_rules[].prefix_list_ids`: Prefix-list destinations for an egress rule.
    - `compute_provider.aws.ec2.egress_rules[].from_port`: Start of the egress rule port range.
    - `compute_provider.aws.ec2.egress_rules[].protocol`: Egress rule protocol; `-1` allows every protocol.
    - `compute_provider.aws.ec2.egress_rules[].security_groups`: Destination security-group IDs for an egress rule.
    - `compute_provider.aws.ec2.egress_rules[].self`: Allows traffic to the managed security group itself when true.
    - `compute_provider.aws.ec2.egress_rules[].to_port`: End of the egress rule port range.
    - `compute_provider.aws.ec2.egress_rules[].description`: Optional egress rule description.
    - `compute_provider.aws.ec2.additional_security_group_ids`: Existing security groups attached to every v2 EC2 runner configuration unless overridden. The default is `[]`.
    - `compute_provider.aws.ec2.cloudwatch_agent.config`: Optional complete CloudWatch agent configuration inherited by v2 EC2 runner configurations. The default is null; enablement remains configuration-owned.
    - `compute_provider.aws.ec2.instance_profile_path`: IAM path for module-managed EC2 instance profiles. The default is null.
    - `compute_provider.aws.ec2.key_name`: Optional EC2 key-pair name inherited by v2 EC2 runner configurations. The default is null.
    - `compute_provider.aws.ec2.associate_public_ipv4_address`: Associates public IPv4 addresses with v2 EC2 runners unless overridden. The default is `false`.
    - `compute_provider.aws.ec2.tags`: Default tags for runtime EC2 resources. The default is `{}` and runner-configuration EC2 tags take precedence.
    - `compute_provider.aws.ec2.ami.housekeeper`: Global configuration for the shared AMI-housekeeper Lambda.
    - `compute_provider.aws.ec2.ami.housekeeper.enabled`: Creates the shared AMI housekeeper when true. The default is `false`, and the value must be known during planning because it controls the module instance.
    - `compute_provider.aws.ec2.ami.housekeeper.cleanup_config`: AMI cleanup selection and safety settings. The default is `{}`, which resolves the leaf defaults described below in the AMI-housekeeper module.
    - `compute_provider.aws.ec2.ami.housekeeper.cleanup_config.maxItems`: Optional maximum number of AMIs queried for cleanup. The default is null, which applies no maximum.
    - `compute_provider.aws.ec2.ami.housekeeper.cleanup_config.minimumDaysOld`: Minimum AMI age in days before cleanup. The effective default is `30`.
    - `compute_provider.aws.ec2.ami.housekeeper.cleanup_config.amiFilters`: AMI filters, each containing `Name` and `Values`. The effective default selects images with `state = available` and `image-type = machine`.
    - `compute_provider.aws.ec2.ami.housekeeper.cleanup_config.launchTemplateNames`: Optional launch-template names whose referenced AMIs are retained. The default is null, which selects no launch templates.
    - `compute_provider.aws.ec2.ami.housekeeper.cleanup_config.ssmParameterNames`: Optional Parameter Store names whose referenced AMIs are retained. The default is null, which selects no parameters.
    - `compute_provider.aws.ec2.ami.housekeeper.cleanup_config.dryRun`: Reports eligible AMIs without deregistering them when true. The effective default is `false`.
    - `compute_provider.aws.ec2.ami.housekeeper.artifact`: AMI-housekeeper artifact selection. Set at most one of `zip` or `s3`; when both are null, the packaged archive is used.
    - `compute_provider.aws.ec2.ami.housekeeper.artifact.zip`: Optional local path to the AMI-housekeeper Lambda archive. The default is null.
    - `compute_provider.aws.ec2.ami.housekeeper.artifact.s3`: Optional key and object version in the shared `lambda.artifact.s3.bucket`. Wrapper presence selects S3 and requires a non-null shared bucket and key.
    - `compute_provider.aws.ec2.ami.housekeeper.artifact.s3.key`: Object key of the AMI-housekeeper Lambda archive.
    - `compute_provider.aws.ec2.ami.housekeeper.artifact.s3.object_version`: Optional object version of the AMI-housekeeper Lambda archive. The default is null.
    - `compute_provider.aws.ec2.ami.housekeeper.lambda.memory_size`: AMI-housekeeper Lambda memory in MB. The default is `256`.
    - `compute_provider.aws.ec2.ami.housekeeper.lambda.timeout`: AMI-housekeeper Lambda timeout in seconds. The default is `300`.
    - `compute_provider.aws.ec2.ami.housekeeper.schedule.expression`: AMI-housekeeper EventBridge schedule expression. The default is `cron(11 7 * * ? *)`.
    - `compute_provider.aws.ec2.instance_termination_watcher`: Global configuration for the shared EC2 instance-termination watcher.
    - `compute_provider.aws.ec2.instance_termination_watcher.enabled`: Creates the shared EC2 termination watcher when true. The default is `false`, and the value must be known during planning because it controls the module instance.
    - `compute_provider.aws.ec2.instance_termination_watcher.features.enable_spot_termination_handler`: Enables the Spot termination-event handler. The default is `true`, and the value must be known during planning because it controls child resources.
    - `compute_provider.aws.ec2.instance_termination_watcher.features.enable_spot_termination_notification_watcher`: Enables the Spot interruption-warning watcher. The default is `true`, and the value must be known during planning because it controls child resources.
    - `compute_provider.aws.ec2.instance_termination_watcher.enable_runner_deregistration`: Deregisters terminated runners from GitHub when true. The default is `true`, and the value must be known during planning because it controls deregistration resources.
    - `compute_provider.aws.ec2.instance_termination_watcher.environment_variables`: Additional termination-watcher Lambda environment variables. The default is `{}`.
    - `compute_provider.aws.ec2.instance_termination_watcher.artifact`: Termination-watcher artifact selection. Set at most one of `zip` or `s3`; when both are null, the packaged archive is used.
    - `compute_provider.aws.ec2.instance_termination_watcher.artifact.zip`: Optional local path to the termination-watcher Lambda archive. The default is null.
    - `compute_provider.aws.ec2.instance_termination_watcher.artifact.s3`: Optional key and object version in the shared `lambda.artifact.s3.bucket`. Wrapper presence selects S3 and requires a non-null shared bucket and key.
    - `compute_provider.aws.ec2.instance_termination_watcher.artifact.s3.key`: Object key of the termination-watcher Lambda archive.
    - `compute_provider.aws.ec2.instance_termination_watcher.artifact.s3.object_version`: Optional object version of the termination-watcher Lambda archive. The default is null.
    - `compute_provider.aws.ec2.instance_termination_watcher.lambda.memory_size`: Optional watcher Lambda memory in MB. The default is null, which delegates to the termination-watcher module.
    - `compute_provider.aws.ec2.instance_termination_watcher.lambda.timeout`: Optional watcher Lambda timeout in seconds. The default is null, which delegates to the termination-watcher module.
    - `compute_provider.aws.ec2.runner_binaries`: Global configuration for the shared runner-distribution buckets and syncers, created once per unique enabled runner operating-system and architecture pair.
    - `compute_provider.aws.ec2.runner_binaries.enabled`: Default for whether EC2 runner configurations use the synchronized runner distribution. The default is `true`; a runner configuration may override it through `compute_provider.aws.ec2.binaries_syncer.enabled`. Every resolved enable value must be known during planning because it determines the syncer module instances.
    - `compute_provider.aws.ec2.runner_binaries.targets`: Optional plan-shaping map of shared runner-distribution targets, keyed by `<os>_<architecture>`. The default is null, which discovers enabled targets from runner configurations. Set this map when unrelated apply-time values make that discovery unknown. An empty map creates no shared binary syncers; every enabled runner platform must have a corresponding entry.
    - `compute_provider.aws.ec2.runner_binaries.targets[].os`: Runner operating system for the target. Valid values are `linux`, `osx`, and `windows`.
    - `compute_provider.aws.ec2.runner_binaries.targets[].architecture`: Runner distribution architecture for the target. Valid values are `x64` and `arm64`.
    - `compute_provider.aws.ec2.runner_binaries.s3`: Settings for each shared runner-distribution bucket.
    - `compute_provider.aws.ec2.runner_binaries.s3.encryption`: Server-side encryption settings for each distribution bucket.
    - `compute_provider.aws.ec2.runner_binaries.s3.encryption.enabled`: Creates an explicit distribution-bucket encryption configuration when true. The default is `true`, and the value must be known during planning because it controls resource shape. Keep `kms_master_key_id` null when this is false.
    - `compute_provider.aws.ec2.runner_binaries.s3.encryption.bucket_key_enabled`: Optional S3 Bucket Key setting. The default is null.
    - `compute_provider.aws.ec2.runner_binaries.s3.encryption.sse_algorithm`: Server-side encryption algorithm. The default is `AES256`; valid values are `AES256`, `aws:kms`, and `aws:kms:dsse`. When `kms_master_key_id` is set, use one of the KMS algorithms.
    - `compute_provider.aws.ec2.runner_binaries.s3.encryption.kms_master_key_id`: Optional KMS key identifier for the distribution bucket. The default is null, and its nullness must be known during planning because it controls the syncer KMS policy. The syncer receives KMS access, but runner roles do not derive `kms:Decrypt` from this field; grant runner roles decrypt access separately when using a CMK.
    - `compute_provider.aws.ec2.runner_binaries.s3.tags`: Additional tags for each distribution bucket. The default is `{}`; these merge after global `tags`.
    - `compute_provider.aws.ec2.runner_binaries.s3.versioning`: Distribution-bucket versioning state. The default is `Disabled`; valid values are `Disabled`, `Enabled`, and `Suspended`. After enabling versioning, Terraform cannot return the bucket to `Disabled`; use `Suspended` instead.
    - `compute_provider.aws.ec2.runner_binaries.s3.logging`: Optional access-logging settings for each distribution bucket.
    - `compute_provider.aws.ec2.runner_binaries.s3.logging.bucket`: Existing target bucket for access logs. The default is null, and its nullness must be known during planning because it controls the logging resource.
    - `compute_provider.aws.ec2.runner_binaries.s3.logging.prefix`: Optional access-log prefix. The default is null, which uses the distribution-bucket name when logging is enabled. A non-null prefix requires `logging.bucket`.
    - `compute_provider.aws.ec2.runner_binaries.syncer`: Component-specific settings for the shared runner-binary syncer Lambda.
    - `compute_provider.aws.ec2.runner_binaries.syncer.artifact`: Syncer Lambda artifact selection. Set at most one of `zip` or `s3`; when both are null, the packaged archive is used.
    - `compute_provider.aws.ec2.runner_binaries.syncer.artifact.zip`: Optional local path to the syncer Lambda archive. The default is null.
    - `compute_provider.aws.ec2.runner_binaries.syncer.artifact.s3`: Optional key and object version in the shared `lambda.artifact.s3.bucket`. Wrapper presence selects S3 and requires a non-null shared bucket and key.
    - `compute_provider.aws.ec2.runner_binaries.syncer.artifact.s3.key`: Object key of the syncer Lambda archive. Required when the `s3` wrapper is present.
    - `compute_provider.aws.ec2.runner_binaries.syncer.artifact.s3.object_version`: Optional object version of the syncer Lambda archive. The default is null.
    - `compute_provider.aws.ec2.runner_binaries.syncer.lambda`: Syncer Lambda sizing settings. Runtime, architecture, networking, role, tags, logging, and tracing come from their global experimental blocks.
    - `compute_provider.aws.ec2.runner_binaries.syncer.lambda.memory_size`: Memory allocated to the syncer Lambda in MB. The default is `256`.
    - `compute_provider.aws.ec2.runner_binaries.syncer.lambda.timeout`: Syncer Lambda timeout in seconds. The default is `300`.
    - `compute_provider.aws.ec2.runner_binaries.syncer.schedule`: EventBridge schedule settings for the syncer Lambda.
    - `compute_provider.aws.ec2.runner_binaries.syncer.schedule.expression`: EventBridge schedule expression. The default is `cron(27 * * * ? *)`.
    - `compute_provider.aws.ec2.runner_binaries.syncer.schedule.state`: EventBridge rule state. The default is `ENABLED`; valid values are `DISABLED`, `ENABLED`, and `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS`.
    - `compute_provider.aws.microvm`: Global defaults for AWS Lambda MicroVM runner configurations. This block supplies defaults and does not select MicroVM for any runner configuration.
    - `compute_provider.aws.microvm.image_arn`: Default Lambda MicroVM image ARN. The default is null; every selected MicroVM configuration must resolve a valid image ARN globally or locally.
    - `compute_provider.aws.microvm.image_version`: Optional default MicroVM image version. The default is null.
    - `compute_provider.aws.microvm.ingress_network_connectors`: Default ingress Lambda network-connector ARNs passed to RunMicrovm. The default is `[]`; at most 10 may be configured.
    - `compute_provider.aws.microvm.egress_network_connectors`: Default egress Lambda network-connector ARNs passed to RunMicrovm. The default is `[]`; at most 10 may be configured.
    - `compute_provider.aws.microvm.maximum_duration_in_seconds`: Optional default maximum MicroVM lifetime. The default is null; valid non-null values are integers from 1 through 28,800 seconds.
    - `compute_provider.aws.microvm.environment_variables`: Default provider-specific control-plane environment variables. The default is `{}` and runner-configuration values take precedence.
    - `compute_provider.aws.microvm.iam.resource_arns.images`: Optional default MicroVM image ARN allowlist for RunMicrovm and TerminateMicrovm. Null restricts both actions to the resolved `image_arn`; set an explicit list when dynamic image overrides are enabled. Required list and connector permissions remain separately scoped to `*`.
    - `compute_provider.aws.microvm.iam.additional_policy_json.scale_up`: Optional default additional provider policy attached separately to the scale-up Lambda role.
    - `compute_provider.aws.microvm.iam.managed_policies.scale_up`: Optional plan-known managed-policy wrapper attached to the scale-up Lambda role.
    - `compute_provider.aws.microvm.iam.managed_policies.scale_up.arn`: Managed-policy ARN; it may remain unknown until apply.
    - `compute_provider.aws.microvm.iam.managed_policies.pool`: Optional plan-known managed-policy wrapper attached to the pool Lambda role.
    - `compute_provider.aws.microvm.iam.managed_policies.pool.arn`: Managed-policy ARN; it may remain unknown until apply.

    Each `experimental.multi_runner_config` entry supports the following nested fields:

    - `multi_runner_config[].tags`: Configuration-wide tags. These override global `experimental.tags`; narrower component and compute-provider tag maps take precedence for their resources. Flat `tags` are not merged into v2 queues or runner configurations.
    - `multi_runner_config[].runner.os`: Runner operating system.
    - `multi_runner_config[].runner.architecture`: Runner distribution architecture.
    - `multi_runner_config[].runner.disable_default_labels`: Prevents GitHub default labels from being registered.
    - `multi_runner_config[].runner.extra_labels`: Additional labels combined with `orchestration_provider.webhook.matcherConfig.labelMatchers` for webhook runner configurations. Default self-hosted, operating-system, and architecture labels are also included unless `runner.disable_default_labels` is true.
    - `multi_runner_config[].runner.group_name`: GitHub runner group used during registration.
    - `multi_runner_config[].runner.name_prefix`: Prefix added to registered runner names.
    - `multi_runner_config[].runner.run_as_root`: Runs the runner service as root when supported by the compute provider.
    - `multi_runner_config[].runner.run_as`: Operating-system user used when `run_as_root` is false.
    - `multi_runner_config[].runner.auto_update_disabled`: Disables the GitHub runner application's built-in updater.
    - `multi_runner_config[].runner.tags`: Tags for common runner resources, currently the managed runner IAM role. These override entry-level `tags`.
    - `multi_runner_config[].runner.hooks.job_started`: Script content installed as the runner job-started hook.
    - `multi_runner_config[].runner.hooks.job_completed`: Script content installed as the runner job-completed hook.
    - `multi_runner_config[].runner.iam.role`: Optional externally managed runner-role wrapper. When set, inherited managed policies and trust additions are suppressed.
    - `multi_runner_config[].runner.iam.role.arn`: ARN of an externally managed runner role. When set, `runner-config` does not create or modify that role.
    - `multi_runner_config[].runner.iam.managed_policy_arns`: Named managed-policy ARNs attached to the module-managed runner role. Keep this empty or null when the runner configuration selects an external `runner.iam.role`.
    - `multi_runner_config[].runner.iam.additional_trust_policy_json`: Optional IAM policy document merged with the selected compute provider's default runner-role trust policy. Keep it null when the runner configuration selects an external `runner.iam.role`.
    - `multi_runner_config[].runner.iam.path`: IAM path for the module-managed runner role.
    - `multi_runner_config[].runner.iam.permissions_boundary`: Permissions-boundary ARN for the module-managed runner role.
    - `multi_runner_config[].lambda`: Lambda runtime, architecture, networking, tags, and role substrate shared by orchestration and the runner-configuration SSM housekeeper. Scale function settings belong under `orchestration_provider.webhook.lambda`.
    - `multi_runner_config[].lambda.runtime`: Per-configuration runtime override for runner-config Lambda functions.
    - `multi_runner_config[].lambda.architecture`: Per-configuration architecture override for runner-config Lambda functions.
    - `multi_runner_config[].lambda.subnet_ids`: Per-configuration subnet override for runner-config Lambda functions.
    - `multi_runner_config[].lambda.security_group_ids`: Per-configuration security-group override for runner-config Lambda functions.
    - `multi_runner_config[].lambda.tags`: Per-configuration tags for control-plane Lambda functions. Component tags override this map.
    - `multi_runner_config[].lambda.role.path`: Per-configuration IAM path for module-managed Lambda roles. Null inherits `experimental.lambda.role.path`, then `experimental.roles.path`.
    - `multi_runner_config[].lambda.role.permissions_boundary`: Per-configuration permissions-boundary ARN for module-managed Lambda roles. Null inherits `experimental.lambda.role.permissions_boundary`, then `experimental.roles.permissions_boundary`.
    - `multi_runner_config[].orchestration_provider`: Demand-controller selection. Exactly one typed provider block must be non-null. Only `webhook` is supported today; additional providers can be added without moving the webhook contract.
    - `multi_runner_config[].orchestration_provider.webhook`: Selects the workflow-job webhook control plane, including its SQS build queue, scale-up, scheduled scale-down/pool, and optional job-retry resources.
    - `multi_runner_config[].orchestration_provider.webhook.runner.boot_time_in_minutes`: Expected runner boot duration used by webhook scale-down and pool controls. Null inherits `experimental.orchestration_provider.webhook.runner.boot_time_in_minutes`.
    - `multi_runner_config[].orchestration_provider.webhook.runner.ephemeral`: Registers webhook-orchestrated runners in ephemeral mode. Null inherits `experimental.orchestration_provider.webhook.runner.ephemeral`.
    - `multi_runner_config[].orchestration_provider.webhook.runner.jit_config_enabled`: Explicitly enables or disables just-in-time configuration. Null inherits the global webhook value; if both are null, behavior follows the resolved webhook `ephemeral` mode.
    - `multi_runner_config[].orchestration_provider.webhook.runner.maximum_count`: Maximum number of runners managed by the webhook orchestration provider for this configuration. Null inherits `experimental.orchestration_provider.webhook.runner.maximum_count`.
    - `multi_runner_config[].orchestration_provider.webhook.github.organization_runners`: Registers runners at organization scope when true; otherwise repository-scoped registration is used.
    - `multi_runner_config[].orchestration_provider.webhook.matcherConfig.labelMatchers`: Groups of labels used to match webhook jobs to this configuration.
    - `multi_runner_config[].orchestration_provider.webhook.matcherConfig.exactMatch`: Deprecated one-way match. When true, every workflow-job label must appear in a configured label group, but that group may contain additional labels.
    - `multi_runner_config[].orchestration_provider.webhook.matcherConfig.bidirectionalLabelMatch`: Requires an exact two-way set match between workflow-job labels and a configured label group, with no extra or missing labels.
    - `multi_runner_config[].orchestration_provider.webhook.matcherConfig.priority`: Ordering used when multiple configurations match the same job.
    - `multi_runner_config[].orchestration_provider.webhook.matcherConfig.enableDynamicLabels`: Enables runtime interpretation of supported dynamic AWS labels.
    - `multi_runner_config[].orchestration_provider.webhook.matcherConfig.awsDynamicLabelsPolicy`: Optional policy restricting values accepted from dynamic AWS labels.
    - `multi_runner_config[].orchestration_provider.webhook.matcherConfig.awsDynamicLabelsPolicy.blocked_keys`: Dynamic-label keys rejected for this runner configuration. The default is `[]`.
    - `multi_runner_config[].orchestration_provider.webhook.matcherConfig.awsDynamicLabelsPolicy.restricted_keys`: Per-key allow, deny, and maximum-value restrictions. The default is `{}`.
    - `multi_runner_config[].orchestration_provider.webhook.matcherConfig.awsDynamicLabelsPolicy.restricted_keys.<key>.allowed`: Values explicitly allowed for the dynamic-label key. The default is `[]`.
    - `multi_runner_config[].orchestration_provider.webhook.matcherConfig.awsDynamicLabelsPolicy.restricted_keys.<key>.denied`: Values explicitly denied for the dynamic-label key. The default is `[]`.
    - `multi_runner_config[].orchestration_provider.webhook.matcherConfig.awsDynamicLabelsPolicy.restricted_keys.<key>.max`: Optional maximum accepted value for the dynamic-label key. The default is null.
    - `multi_runner_config[].orchestration_provider.webhook.queue.delay_webhook_event`: Delay in seconds applied to webhook job messages. Null inherits the global queue default.
    - `multi_runner_config[].orchestration_provider.webhook.queue.job_queue_retention_in_seconds`: Build-queue message retention period in seconds. Null inherits the global queue default.
    - `multi_runner_config[].orchestration_provider.webhook.queue.visibility_timeout_seconds`: Build-queue visibility timeout. Null inherits the global queue default; the resolved value must be at least six times the resolved `orchestration_provider.webhook.lambda.scale.up.timeout` so Lambda has enough time to retry throttled invocations.
    - `multi_runner_config[].orchestration_provider.webhook.queue.redrive_build_queue.enabled`: Creates and attaches a dead-letter queue for the build queue. A null wrapper or null leaf inherits the corresponding global value.
    - `multi_runner_config[].orchestration_provider.webhook.queue.redrive_build_queue.maxReceiveCount`: Number of receives before a build message moves to the dead-letter queue. A null wrapper or null leaf inherits the corresponding global value, and the resolved value must be greater than zero when redrive is enabled.
    - `multi_runner_config[].orchestration_provider.webhook.queue.tags`: Tags for configuration-owned queue resources. These merge after global queue tags and entry-level `tags`; component tags override this map.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.up.memory_size`: Memory allocated to the scale-up Lambda in MB.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.up.timeout`: Scale-up Lambda timeout in seconds.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.up.reserved_concurrent_executions`: Reserved concurrency for the scale-up Lambda. Use `-1` for unreserved concurrency.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.up.job_queued_check_enabled`: Enables the queued-job verification before scaling. Null inherits the global value; if both are null, behavior follows the resolved runner mode.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.up.event_source_mapping.batch_size`: Maximum build-queue records delivered to one scale-up Lambda invocation.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds`: Maximum batching window for build-queue records.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.up.tags`: Tags for scale-up resources. These override entry-level and shared Lambda, queue, and log-group tags within their resource scopes.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.down.memory_size`: Memory allocated to the scale-down Lambda in MB.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.down.timeout`: Scale-down Lambda timeout in seconds.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.down.schedule_expression`: EventBridge schedule expression that invokes scale-down.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.down.minimum_running_time_in_minutes`: Minimum runner age before scale-down may terminate it. Null inherits the global value; if both are null, the operating-system default is selected.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.down.idle_config`: Time-based desired idle-runner configurations.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.down.idle_config[].cron`: Cron expression identifying when the idle configuration applies.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.down.idle_config[].timeZone`: IANA time zone used to evaluate `cron`.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.down.idle_config[].idleCount`: Number of idle runners to retain during the matching period.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.down.idle_config[].evictionStrategy`: Selection strategy used when excess idle runners are removed.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.scale.down.tags`: Tags for scale-down resources. These override entry-level and shared Lambda and log-group tags within their resource scopes.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.pool.memory_size`: Memory allocated to the pool Lambda in MB.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.pool.timeout`: Pool Lambda timeout in seconds.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.pool.reserved_concurrent_executions`: Reserved concurrency for the pool Lambda. Use `-1` for unreserved concurrency.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.pool.config`: Scheduled target pool sizes. An empty list disables the pool component.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.pool.config[].schedule_expression`: Scheduler expression that activates the target size.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.pool.config[].schedule_expression_timezone`: Optional IANA time zone used to evaluate the schedule.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.pool.config[].size`: Desired number of runners for the schedule.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.pool.include_busy_runners`: Includes busy runners when reconciling scheduled pool capacity.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.pool.runner_owner`: Optional GitHub organization or repository owner used when creating pooled runners.
    - `multi_runner_config[].orchestration_provider.webhook.lambda.pool.tags`: Tags for pool resources. These override entry-level and shared Lambda and log-group tags within their resource scopes.
    - `multi_runner_config[].orchestration_provider.webhook.job_retry.enabled`: Creates the retry queue, Lambda function, event-source mapping, and related IAM resources.
    - `multi_runner_config[].orchestration_provider.webhook.job_retry.delay_in_seconds`: Initial delay before a queued-job retry check.
    - `multi_runner_config[].orchestration_provider.webhook.job_retry.delay_backoff`: Multiplier applied to the delay after each unsuccessful check.
    - `multi_runner_config[].orchestration_provider.webhook.job_retry.max_attempts`: Maximum retry-check attempts before the message is no longer republished.
    - `multi_runner_config[].orchestration_provider.webhook.job_retry.tags`: Tags for job-retry resources. These override entry-level and shared Lambda, queue, and log-group tags within their resource scopes.
    - `multi_runner_config[].orchestration_provider.webhook.job_retry.lambda.memory_size`: Memory allocated to the job-retry Lambda in MB.
    - `multi_runner_config[].orchestration_provider.webhook.job_retry.lambda.reserved_concurrent_executions`: Reserved concurrency for the job-retry Lambda. Use `-1` for unreserved concurrency.
    - `multi_runner_config[].orchestration_provider.webhook.job_retry.lambda.timeout`: Job-retry Lambda timeout in seconds and visibility timeout for its retry queue.
    - `multi_runner_config[].ssm.paths.root`: Base Parameter Store root for this runner configuration. The configuration key is always appended to preserve configuration isolation. The omitted global root derives `/github-action-runners/<prefix>`.
    - `multi_runner_config[].ssm.paths.tokens`: Path segment below the runner-configuration root used for runner registration tokens and just-in-time configuration.
    - `multi_runner_config[].ssm.paths.config`: Path segment below the runner-configuration root used for persistent runner configuration.
    - `multi_runner_config[].ssm.tags`: Shared tags for runner-configuration-owned SSM resources. These override entry-level `tags`.
    - `multi_runner_config[].ssm.parameters.tags`: Tags for Terraform-managed and runtime-created runner configuration parameters. These override `ssm.tags`.
    - `multi_runner_config[].ssm.housekeeper.schedule_expression`: EventBridge schedule expression that invokes the runner-configuration SSM housekeeper.
    - `multi_runner_config[].ssm.housekeeper.state`: EventBridge rule state for the runner-configuration SSM housekeeper. Valid values are `DISABLED`, `ENABLED`, and `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS`.
    - `multi_runner_config[].ssm.housekeeper.tags`: Tags for SSM housekeeper resources. These override entry-level, shared Lambda, shared log, and `ssm.tags` values.
    - `multi_runner_config[].ssm.housekeeper.lambda.artifact`: Per-configuration SSM-housekeeper artifact selection. A selected `zip` or `s3` source overrides the global `ssm.housekeeper.lambda.artifact`; when neither level selects a source, runner-config uses its packaged runner control-plane archive.
    - `multi_runner_config[].ssm.housekeeper.lambda.artifact.zip`: Optional local path to the SSM-housekeeper Lambda archive.
    - `multi_runner_config[].ssm.housekeeper.lambda.artifact.s3`: Optional key and object version in the shared `lambda.artifact.s3.bucket`. Wrapper presence selects S3 for this SSM housekeeper, must be known during planning, and requires a non-null shared bucket and key.
    - `multi_runner_config[].ssm.housekeeper.lambda.artifact.s3.key`: Object key of this runner configuration's SSM-housekeeper Lambda archive.
    - `multi_runner_config[].ssm.housekeeper.lambda.artifact.s3.object_version`: Optional object version of this runner configuration's SSM-housekeeper Lambda archive.
    - `multi_runner_config[].ssm.housekeeper.lambda.memory_size`: Memory allocated to the SSM housekeeper Lambda in MB.
    - `multi_runner_config[].ssm.housekeeper.lambda.timeout`: SSM housekeeper Lambda timeout in seconds.
    - `multi_runner_config[].ssm.housekeeper.config.tokenPath`: Optional cleanup path. A global value is shared by every runner configuration, so omit it to derive each configuration's isolated token path.
    - `multi_runner_config[].ssm.housekeeper.config.minimumDaysOld`: Minimum parameter age in days before deletion is allowed.
    - `multi_runner_config[].ssm.housekeeper.config.dryRun`: Reports eligible parameters without deleting them when true.
    - `multi_runner_config[].observability.logs.level`: Application log level for runner-configuration control-plane functions.
    - `multi_runner_config[].observability.logs.retention_in_days`: CloudWatch Logs retention period for runner-configuration resources.
    - `multi_runner_config[].observability.logs.kms_key_id`: Optional KMS key ID or ARN used to encrypt runner-configuration CloudWatch log groups.
    - `multi_runner_config[].observability.logs.class`: CloudWatch log-group class for runner-configuration resources.
    - `multi_runner_config[].observability.logs.tags`: Shared tags for runner-configuration CloudWatch log groups. Component tags override this map.
    - `multi_runner_config[].observability.tracing.mode`: Optional Lambda tracing mode. Its nullness must be known during planning because it controls X-Ray IAM and tracing blocks.
    - `multi_runner_config[].observability.tracing.capture_http_requests`: Enables HTTP request capture in the tracing helper.
    - `multi_runner_config[].observability.tracing.capture_error`: Enables error capture in the tracing helper.
    - `multi_runner_config[].observability.metrics.enable`: Enables module-emitted metrics.
    - `multi_runner_config[].observability.metrics.namespace`: CloudWatch namespace used for emitted metrics.
    - `multi_runner_config[].observability.metrics.metric.enable_github_app_rate_limit`: Emits GitHub App rate-limit metrics.
    - `multi_runner_config[].observability.metrics.metric.enable_job_retry`: Emits job-retry metrics.
    - `multi_runner_config[].compute_provider`: Typed compute-provider namespaces. Exactly one nested provider block must be non-null, and that populated block selects the provider. Its presence must be known during planning; values inside it may remain unknown until apply.
    - `multi_runner_config[].compute_provider.aws`: AWS compute-provider namespace. The namespace itself does not select a provider.
    - `multi_runner_config[].compute_provider.aws.ec2`: AWS EC2-specific configuration. A non-null block selects AWS EC2 for this runner configuration.
    - `multi_runner_config[].compute_provider.aws.ec2.metadata_options.instance_metadata_tags`: Exposes instance tags through Instance Metadata Service when enabled.
    - `multi_runner_config[].compute_provider.aws.ec2.metadata_options.http_endpoint`: Enables or disables the Instance Metadata Service endpoint.
    - `multi_runner_config[].compute_provider.aws.ec2.metadata_options.http_tokens`: Controls whether IMDSv2 session tokens are optional or required.
    - `multi_runner_config[].compute_provider.aws.ec2.metadata_options.http_put_response_hop_limit`: Network hop limit for Instance Metadata Service token responses.
    - `multi_runner_config[].compute_provider.aws.ec2.ami.filter`: EC2 AMI filters combined with the default AMI-name filter.
    - `multi_runner_config[].compute_provider.aws.ec2.ami.owners`: AWS account IDs or aliases allowed to own the selected AMI.
    - `multi_runner_config[].compute_provider.aws.ec2.ami.id_ssm_parameter`: Optional externally managed SSM parameter containing the AMI ID. The wrapper's presence selects external ownership at plan time.
    - `multi_runner_config[].compute_provider.aws.ec2.ami.id_ssm_parameter.arn`: ARN of the externally managed SSM parameter. The ARN may be unknown until apply.
    - `multi_runner_config[].compute_provider.aws.ec2.ami.kms_key`: Optional KMS key required to launch encrypted AMIs or snapshots. The wrapper's presence selects the KMS policy at plan time.
    - `multi_runner_config[].compute_provider.aws.ec2.ami.kms_key.arn`: ARN of the KMS key. The ARN may be unknown until apply.
    - `multi_runner_config[].compute_provider.aws.ec2.block_device_mappings`: EBS mappings added to the runner launch template.
    - `multi_runner_config[].compute_provider.aws.ec2.block_device_mappings[].delete_on_termination`: Deletes the volume when its runner instance terminates.
    - `multi_runner_config[].compute_provider.aws.ec2.block_device_mappings[].device_name`: Device name exposed to the runner instance.
    - `multi_runner_config[].compute_provider.aws.ec2.block_device_mappings[].encrypted`: Enables EBS encryption.
    - `multi_runner_config[].compute_provider.aws.ec2.block_device_mappings[].iops`: Provisioned IOPS for supported volume types.
    - `multi_runner_config[].compute_provider.aws.ec2.block_device_mappings[].kms_key_id`: KMS key ID or ARN used to encrypt the volume.
    - `multi_runner_config[].compute_provider.aws.ec2.block_device_mappings[].snapshot_id`: Snapshot used to initialize the volume.
    - `multi_runner_config[].compute_provider.aws.ec2.block_device_mappings[].throughput`: Provisioned throughput for supported volume types.
    - `multi_runner_config[].compute_provider.aws.ec2.block_device_mappings[].volume_initialization_rate`: Fixed initialization rate in MiB/s for supported snapshot-backed volumes.
    - `multi_runner_config[].compute_provider.aws.ec2.block_device_mappings[].volume_size`: Volume size in GiB.
    - `multi_runner_config[].compute_provider.aws.ec2.block_device_mappings[].volume_type`: EBS volume type.
    - `multi_runner_config[].compute_provider.aws.ec2.create_service_linked_role_spot`: Allows scale-up to create the EC2 Spot service-linked role.
    - `multi_runner_config[].compute_provider.aws.ec2.credit_specification`: CPU credit mode for burstable instance types.
    - `multi_runner_config[].compute_provider.aws.ec2.ebs_optimized`: Requests EBS-optimized runner instances.
    - `multi_runner_config[].compute_provider.aws.ec2.cloudwatch_agent.enabled`: Installs and configures the CloudWatch agent through the default bootstrap flow.
    - `multi_runner_config[].compute_provider.aws.ec2.cloudwatch_agent.config`: Optional complete CloudWatch agent configuration.
    - `multi_runner_config[].compute_provider.aws.ec2.binaries_syncer.enabled`: Enables use of the shared synchronized runner distribution from S3. Null inherits `experimental.compute_provider.aws.ec2.runner_binaries.enabled`.
    - `multi_runner_config[].compute_provider.aws.ec2.detailed_monitoring_enabled`: Enables detailed EC2 monitoring for runner instances.
    - `multi_runner_config[].compute_provider.aws.ec2.ssm_enabled`: Attaches runner permissions and policies required for AWS Systems Manager access.
    - `multi_runner_config[].compute_provider.aws.ec2.user_data.enabled`: Enables launch-template user data.
    - `multi_runner_config[].compute_provider.aws.ec2.user_data.template`: Optional path to a custom user-data template.
    - `multi_runner_config[].compute_provider.aws.ec2.user_data.content`: Optional complete user-data content used instead of rendering a template.
    - `multi_runner_config[].compute_provider.aws.ec2.user_data.pre_install`: Script content inserted before runner installation in the default template.
    - `multi_runner_config[].compute_provider.aws.ec2.user_data.post_install`: Script content inserted after runner installation in the default template.
    - `multi_runner_config[].compute_provider.aws.ec2.user_data.debug_logging_enabled`: Enables verbose user-data tracing, which can expose secrets in logs.
    - `multi_runner_config[].compute_provider.aws.ec2.instance_allocation_strategy`: EC2 Fleet allocation strategy used to select capacity.
    - `multi_runner_config[].compute_provider.aws.ec2.instance_max_spot_price`: Optional maximum hourly Spot price.
    - `multi_runner_config[].compute_provider.aws.ec2.instance_target_capacity_type`: Primary capacity type, either `spot` or `on-demand`.
    - `multi_runner_config[].compute_provider.aws.ec2.instance_type_priorities`: Optional numeric priorities keyed by instance type.
    - `multi_runner_config[].compute_provider.aws.ec2.instance_types`: EC2 instance types available to the scale-up and pool functions.
    - `multi_runner_config[].compute_provider.aws.ec2.additional_security_group_ids`: Existing security groups attached to runner instances.
    - `multi_runner_config[].compute_provider.aws.ec2.managed_security_group_enabled`: Creates the module-managed runner security group when true.
    - `multi_runner_config[].compute_provider.aws.ec2.egress_rules`: Runner security-group egress rules. Null inherits `experimental.compute_provider.aws.ec2.egress_rules`, whose default is the built-in IPv4/IPv6 allow-all rule. Flat `runner_egress_rules` is not inherited by v2.
    - `multi_runner_config[].compute_provider.aws.ec2.egress_rules[].cidr_blocks`: IPv4 CIDR destinations for the runner-configuration egress rule.
    - `multi_runner_config[].compute_provider.aws.ec2.egress_rules[].ipv6_cidr_blocks`: IPv6 CIDR destinations for the runner-configuration egress rule.
    - `multi_runner_config[].compute_provider.aws.ec2.egress_rules[].prefix_list_ids`: Prefix-list destinations for the runner-configuration egress rule.
    - `multi_runner_config[].compute_provider.aws.ec2.egress_rules[].from_port`: Start of the runner-configuration egress rule port range.
    - `multi_runner_config[].compute_provider.aws.ec2.egress_rules[].protocol`: Runner-configuration egress rule protocol; `-1` allows every protocol.
    - `multi_runner_config[].compute_provider.aws.ec2.egress_rules[].security_groups`: Destination security-group IDs for the runner-configuration egress rule.
    - `multi_runner_config[].compute_provider.aws.ec2.egress_rules[].self`: Allows traffic to the managed security group itself when true.
    - `multi_runner_config[].compute_provider.aws.ec2.egress_rules[].to_port`: End of the runner-configuration egress rule port range.
    - `multi_runner_config[].compute_provider.aws.ec2.egress_rules[].description`: Optional runner-configuration egress rule description.
    - `multi_runner_config[].compute_provider.aws.ec2.instance_profile_path`: IAM path for the module-managed EC2 instance profile.
    - `multi_runner_config[].compute_provider.aws.ec2.key_name`: Optional EC2 key-pair name for runner instances.
    - `multi_runner_config[].compute_provider.aws.ec2.associate_public_ipv4_address`: Associates a public IPv4 address with runner instances.
    - `multi_runner_config[].compute_provider.aws.ec2.instance_profile.name`: Name of an externally managed instance profile. Setting it also requires `runner.iam.role`.
    - `multi_runner_config[].compute_provider.aws.ec2.enable_on_demand_failover_for_errors`: EC2 error codes that trigger an on-demand fallback after a Spot launch failure.
    - `multi_runner_config[].compute_provider.aws.ec2.scale_errors`: EC2 error codes treated as retryable scale-up failures.
    - `multi_runner_config[].compute_provider.aws.ec2.subnet_ids`: Subnets from which scale-up may launch runners. A null configuration value inherits the experimental global value.
    - `multi_runner_config[].compute_provider.aws.ec2.vpc_id`: VPC in which runner networking resources are created. A null configuration value inherits the experimental global value.
    - `multi_runner_config[].compute_provider.aws.ec2.cpu_options.core_count`: Number of CPU cores exposed to the runner instance.
    - `multi_runner_config[].compute_provider.aws.ec2.cpu_options.threads_per_core`: Number of hardware threads exposed per CPU core.
    - `multi_runner_config[].compute_provider.aws.ec2.cpu_options.amd_sev_snp`: Enables or disables AMD SEV-SNP on supported instance types.
    - `multi_runner_config[].compute_provider.aws.ec2.cpu_options.nested_virtualization`: Enables or disables nested virtualization on supported instance types.
    - `multi_runner_config[].compute_provider.aws.ec2.placement.affinity`: Host affinity setting.
    - `multi_runner_config[].compute_provider.aws.ec2.placement.availability_zone`: Availability Zone in which the instance is placed.
    - `multi_runner_config[].compute_provider.aws.ec2.placement.group_id`: Placement-group ID.
    - `multi_runner_config[].compute_provider.aws.ec2.placement.group_name`: Placement-group name.
    - `multi_runner_config[].compute_provider.aws.ec2.placement.host_id`: Dedicated Host ID.
    - `multi_runner_config[].compute_provider.aws.ec2.placement.host_resource_group_arn`: ARN of the host resource group used for placement.
    - `multi_runner_config[].compute_provider.aws.ec2.placement.spread_domain`: Spread-domain placement value.
    - `multi_runner_config[].compute_provider.aws.ec2.placement.tenancy`: Instance tenancy.
    - `multi_runner_config[].compute_provider.aws.ec2.placement.partition_number`: Placement-group partition number.
    - `multi_runner_config[].compute_provider.aws.ec2.license_specifications[].license_configuration_arn`: ARN of a License Manager license configuration.
    - `multi_runner_config[].compute_provider.aws.ec2.use_dedicated_host`: Enables the dedicated-host launch path required for macOS runners.
    - `multi_runner_config[].compute_provider.aws.ec2.log_files`: Optional log files collected by the CloudWatch agent.
    - `multi_runner_config[].compute_provider.aws.ec2.log_files[].log_group_name`: CloudWatch log-group name before optional prefixing.
    - `multi_runner_config[].compute_provider.aws.ec2.log_files[].prefix_log_group`: Prefixes the log-group name with the runner configuration path when true.
    - `multi_runner_config[].compute_provider.aws.ec2.log_files[].file_path`: File or glob read by the CloudWatch agent.
    - `multi_runner_config[].compute_provider.aws.ec2.log_files[].log_stream_name`: CloudWatch log-stream name template.
    - `multi_runner_config[].compute_provider.aws.ec2.log_files[].log_class`: CloudWatch log-group class for the collected file.
    - `multi_runner_config[].compute_provider.aws.ec2.tags`: Tags for runtime EC2 instances, volumes, network interfaces, and eligible Spot requests. These override entry-level tags and the generated runner `Name`; provider-required bootstrap tags take final precedence.
    - `multi_runner_config[].compute_provider.aws.microvm`: AWS Lambda MicroVM configuration. A non-null block selects MicroVM for this runner configuration and requires a Linux ARM64 runner plus ephemeral webhook orchestration with JIT configuration enabled. The resolved `runner.iam.role` is used as the MicroVM execution role.
    - `multi_runner_config[].compute_provider.aws.microvm.image_arn`: Lambda MicroVM image ARN. Null inherits `experimental.compute_provider.aws.microvm.image_arn`.
    - `multi_runner_config[].compute_provider.aws.microvm.image_version`: Optional MicroVM image-version override. Null inherits the global value.
    - `multi_runner_config[].compute_provider.aws.microvm.ingress_network_connectors`: Up to 10 ingress Lambda network-connector ARNs passed to RunMicrovm. Null inherits the global list.
    - `multi_runner_config[].compute_provider.aws.microvm.egress_network_connectors`: Up to 10 egress Lambda network-connector ARNs passed to RunMicrovm. Null inherits the global list.
    - `multi_runner_config[].compute_provider.aws.microvm.maximum_duration_in_seconds`: Optional integer maximum MicroVM lifetime from 1 through 28,800 seconds. Null inherits the global value.
    - `multi_runner_config[].compute_provider.aws.microvm.environment_variables`: Provider-specific control-plane environment variables merged after the global map.
    - `multi_runner_config[].compute_provider.aws.microvm.iam.resource_arns.images`: MicroVM image ARN allowlist for RunMicrovm and TerminateMicrovm. Null inherits the global list, after which a remaining null restricts both actions to the resolved `image_arn`.
    - `multi_runner_config[].compute_provider.aws.microvm.iam.additional_policy_json.scale_up`: Optional additional provider policy for scale-up. Null inherits the global policy.
    - `multi_runner_config[].compute_provider.aws.microvm.iam.managed_policies.scale_up`: Optional plan-known managed-policy wrapper for scale-up. Null inherits the global wrapper.
    - `multi_runner_config[].compute_provider.aws.microvm.iam.managed_policies.scale_up.arn`: Managed-policy ARN; it may remain unknown until apply.
    - `multi_runner_config[].compute_provider.aws.microvm.iam.managed_policies.pool`: Optional plan-known managed-policy wrapper for pool. Null inherits the global wrapper.
    - `multi_runner_config[].compute_provider.aws.microvm.iam.managed_policies.pool.arn`: Managed-policy ARN; it may remain unknown until apply.
  EOT

  type = object({
    tags = optional(map(string), {})

    roles = optional(object({
      path                 = optional(string, null)
      permissions_boundary = optional(string, null)
    }), {})

    runner = optional(object({
      os                     = optional(string, null)
      architecture           = optional(string, null)
      disable_default_labels = optional(bool, false)
      extra_labels           = optional(list(string), [])
      group_name             = optional(string, "Default")
      name_prefix            = optional(string, "")
      run_as_root            = optional(bool, false)
      run_as                 = optional(string, "ec2-user")
      auto_update_disabled   = optional(bool, false)
      tags                   = optional(map(string), {})
      hooks = optional(object({
        job_started   = optional(string, "")
        job_completed = optional(string, "")
      }), {})
      iam = optional(object({
        role = optional(object({
          arn = string
        }), null)
        managed_policy_arns          = optional(map(string), {})
        additional_trust_policy_json = optional(string, null)
        path                         = optional(string, null)
        permissions_boundary         = optional(string, null)
      }), {})
    }), {})

    github = optional(object({
      app = optional(object({
        key_base64 = optional(string)
        key_base64_ssm = optional(object({
          arn  = string
          name = string
        }))
        id = optional(string)
        id_ssm = optional(object({
          arn  = string
          name = string
        }))
        webhook_secret = optional(string)
        webhook_secret_ssm = optional(object({
          arn  = string
          name = string
        }))
      }), null)
      additional_apps = optional(list(object({
        key_base64          = optional(string)
        key_base64_ssm      = optional(object({ arn = string, name = string }))
        id                  = optional(string)
        id_ssm              = optional(object({ arn = string, name = string }))
        installation_id     = optional(string)
        installation_id_ssm = optional(object({ arn = string, name = string }))
      })), [])
      enterprise_server = optional(object({
        url        = optional(string, null)
        ssl_verify = optional(bool, true)
      }), {})
      user_agent = optional(string, "github-aws-runners")
    }), {})

    lambda = optional(object({
      artifact = optional(object({
        s3 = optional(object({
          bucket = optional(string, null)
        }), {})
      }), {})
      runtime      = optional(string, "nodejs24.x")
      architecture = optional(string, "arm64")
      principals = optional(list(object({
        type        = string
        identifiers = list(string)
      })), [])
      subnet_ids         = optional(list(string), [])
      security_group_ids = optional(list(string), [])
      tags               = optional(map(string), {})
      role = optional(object({
        path                 = optional(string, null)
        permissions_boundary = optional(string, null)
      }), {})
    }), {})

    orchestration_provider = optional(object({
      webhook = optional(object({
        queue_selection_strategy = optional(string, "first")
        eventbridge = optional(object({
          enable        = optional(bool, true)
          accept_events = optional(list(string), [])
        }), {})
        matcher_config_parameter_store_tier = optional(string, "Standard")
        runner = optional(object({
          boot_time_in_minutes = optional(number, 5)
          ephemeral            = optional(bool, false)
          jit_config_enabled   = optional(bool, null)
          maximum_count        = optional(number, null)
        }), {})

        github = optional(object({
          repository_white_list = optional(list(string), [])
        }), {})

        lambda = optional(object({
          artifact = optional(object({
            zip = optional(string, null)
            s3 = optional(object({
              key            = string
              object_version = optional(string, null)
            }), null)
          }), {})
          scale = optional(object({
            up = optional(object({
              memory_size                    = optional(number, 512)
              timeout                        = optional(number, 30)
              reserved_concurrent_executions = optional(number, 1)
              job_queued_check_enabled       = optional(bool, null)
              event_source_mapping = optional(object({
                batch_size                         = optional(number, 10)
                maximum_batching_window_in_seconds = optional(number, 0)
              }), {})
              tags = optional(map(string), {})
            }), {})
            down = optional(object({
              memory_size                     = optional(number, 512)
              timeout                         = optional(number, 60)
              schedule_expression             = optional(string, "cron(*/5 * * * ? *)")
              minimum_running_time_in_minutes = optional(number, null)
              idle_config = optional(list(object({
                cron             = string
                timeZone         = string
                idleCount        = number
                evictionStrategy = optional(string, "oldest_first")
              })), [])
              tags = optional(map(string), {})
            }), {})
          }), {})
          webhook = optional(object({
            artifact = optional(object({
              zip = optional(string, null)
              s3 = optional(object({
                key            = string
                object_version = optional(string, null)
              }), null)
            }), {})
            api_gateway_access_log_settings = optional(object({
              destination_arn = string
              format          = string
            }), null)
            memory_size = optional(number, 256)
            timeout     = optional(number, 10)
            tags        = optional(map(string), {})
          }), {})
          pool = optional(object({
            memory_size                    = optional(number, 512)
            timeout                        = optional(number, 60)
            reserved_concurrent_executions = optional(number, 1)
            config = optional(list(object({
              schedule_expression          = string
              schedule_expression_timezone = optional(string)
              size                         = number
            })), [])
            include_busy_runners = optional(bool, false)
            runner_owner         = optional(string, null)
            tags                 = optional(map(string), {})
          }), {})
        }), {})

        queue = optional(object({
          delay_webhook_event            = optional(number, 30)
          job_queue_retention_in_seconds = optional(number, 86400)
          visibility_timeout_seconds     = optional(number, 180)
          redrive_build_queue = optional(object({
            enabled         = optional(bool, false)
            maxReceiveCount = optional(number, null)
            }), {
            enabled         = false
            maxReceiveCount = null
          })
          tags = optional(map(string), {})
          encryption = optional(object({
            kms_data_key_reuse_period_seconds = number
            kms_master_key_id                 = string
            sqs_managed_sse_enabled           = bool
            }), {
            kms_data_key_reuse_period_seconds = null
            kms_master_key_id                 = null
            sqs_managed_sse_enabled           = true
          })
        }), {})
      }), {})
    }), {})

    ssm = optional(object({
      paths = optional(object({
        root    = optional(string, null)
        app     = optional(string, "app")
        webhook = optional(string, "webhook")
        tokens  = optional(string, "runners/tokens")
        config  = optional(string, "runners/config")
      }), {})
      kms_key_id = optional(string, null)
      tags       = optional(map(string), {})
      parameters = optional(object({
        tags = optional(map(string), {})
      }), {})
      housekeeper = optional(object({
        schedule_expression = optional(string, "rate(1 day)")
        state               = optional(string, "ENABLED")
        tags                = optional(map(string), {})
        lambda = optional(object({
          artifact = optional(object({
            zip = optional(string, null)
            s3 = optional(object({
              key            = string
              object_version = optional(string, null)
            }), null)
          }), {})
          memory_size = optional(number, 512)
          timeout     = optional(number, 60)
        }), {})
        config = optional(object({
          tokenPath      = optional(string, null)
          minimumDaysOld = optional(number, 1)
          dryRun         = optional(bool, false)
        }), {})
      }), {})
    }), {})

    observability = optional(object({
      logs = optional(object({
        level             = optional(string, "info")
        retention_in_days = optional(number, 180)
        kms_key_id        = optional(string, null)
        class             = optional(string, "STANDARD")
        tags              = optional(map(string), {})
      }), {})
      tracing = optional(object({
        mode                  = optional(string, null)
        capture_http_requests = optional(bool, false)
        capture_error         = optional(bool, false)
      }), {})
      metrics = optional(object({
        enable    = optional(bool, false)
        namespace = optional(string, "GitHub Runners")
        metric = optional(object({
          enable_github_app_rate_limit    = optional(bool, true)
          enable_job_retry                = optional(bool, true)
          enable_spot_termination         = optional(bool, true)
          enable_spot_termination_warning = optional(bool, true)
        }), {})
      }), {})
    }), {})

    compute_provider = optional(object({
      selections = optional(map(object({
        namespace = string
        type      = string
      })), null)
      aws = optional(object({
        ec2 = optional(object({
          vpc_id                         = optional(string, null)
          subnet_ids                     = optional(list(string), null)
          managed_security_group_enabled = optional(bool, true)
          egress_rules = optional(list(object({
            cidr_blocks      = list(string)
            ipv6_cidr_blocks = list(string)
            prefix_list_ids  = list(string)
            from_port        = number
            protocol         = string
            security_groups  = list(string)
            self             = bool
            to_port          = number
            description      = string
            })), [{
            cidr_blocks      = ["0.0.0.0/0"]
            ipv6_cidr_blocks = ["::/0"]
            prefix_list_ids  = null
            from_port        = 0
            protocol         = "-1"
            security_groups  = null
            self             = null
            to_port          = 0
            description      = null
          }])
          additional_security_group_ids = optional(list(string), [])
          cloudwatch_agent = optional(object({
            config = optional(string, null)
          }), {})
          instance_profile_path         = optional(string, null)
          key_name                      = optional(string, null)
          associate_public_ipv4_address = optional(bool, false)
          tags                          = optional(map(string), {})
          ami = optional(object({
            housekeeper = optional(object({
              enabled = optional(bool, false)
              cleanup_config = optional(object({
                maxItems       = optional(number)
                minimumDaysOld = optional(number)
                amiFilters = optional(list(object({
                  Name   = string
                  Values = list(string)
                })))
                launchTemplateNames = optional(list(string))
                ssmParameterNames   = optional(list(string))
                dryRun              = optional(bool)
              }), {})
              artifact = optional(object({
                zip = optional(string, null)
                s3 = optional(object({
                  key            = string
                  object_version = optional(string, null)
                }), null)
              }), {})
              lambda = optional(object({
                memory_size = optional(number, 256)
                timeout     = optional(number, 300)
              }), {})
              schedule = optional(object({
                expression = optional(string, "cron(11 7 * * ? *)")
              }), {})
            }), {})
          }), {})
          instance_termination_watcher = optional(object({
            enabled = optional(bool, false)
            features = optional(object({
              enable_spot_termination_handler              = optional(bool, true)
              enable_spot_termination_notification_watcher = optional(bool, true)
            }), {})
            enable_runner_deregistration = optional(bool, true)
            environment_variables        = optional(map(string), {})
            artifact = optional(object({
              zip = optional(string, null)
              s3 = optional(object({
                key            = string
                object_version = optional(string, null)
              }), null)
            }), {})
            lambda = optional(object({
              memory_size = optional(number, null)
              timeout     = optional(number, null)
            }), {})
          }), {})
          runner_binaries = optional(object({
            enabled = optional(bool, true)
            targets = optional(map(object({
              os           = string
              architecture = string
            })), null)
            s3 = optional(object({
              encryption = optional(object({
                enabled            = optional(bool, true)
                bucket_key_enabled = optional(bool, null)
                sse_algorithm      = optional(string, "AES256")
                kms_master_key_id  = optional(string, null)
              }), {})
              tags       = optional(map(string), {})
              versioning = optional(string, "Disabled")
              logging = optional(object({
                bucket = optional(string, null)
                prefix = optional(string, null)
              }), {})
            }), {})
            syncer = optional(object({
              artifact = optional(object({
                zip = optional(string, null)
                s3 = optional(object({
                  key            = string
                  object_version = optional(string, null)
                }), null)
              }), {})
              lambda = optional(object({
                memory_size = optional(number, 256)
                timeout     = optional(number, 300)
              }), {})
              schedule = optional(object({
                expression = optional(string, "cron(27 * * * ? *)")
                state      = optional(string, "ENABLED")
              }), {})
            }), {})
          }), {})
        }), {})
        microvm = optional(object({
          image_arn                   = optional(string, null)
          image_version               = optional(string, null)
          ingress_network_connectors  = optional(list(string), [])
          egress_network_connectors   = optional(list(string), [])
          maximum_duration_in_seconds = optional(number, null)
          environment_variables       = optional(map(string), {})
          iam = optional(object({
            resource_arns = optional(object({
              images = optional(list(string), null)
            }), {})
            additional_policy_json = optional(object({
              scale_up = optional(string, null)
            }), {})
            managed_policies = optional(object({
              scale_up = optional(object({
                arn = string
              }), null)
              pool = optional(object({
                arn = string
              }), null)
            }), {})
          }), {})
        }), {})
      }), {})
    }), {})

    multi_runner_config = optional(map(object({
      tags = optional(map(string), {})

      runner = optional(object({
        os                     = optional(string, null)
        architecture           = optional(string, null)
        disable_default_labels = optional(bool, null)
        extra_labels           = optional(list(string), null)
        group_name             = optional(string, null)
        name_prefix            = optional(string, null)
        run_as_root            = optional(bool, null)
        run_as                 = optional(string, null)
        auto_update_disabled   = optional(bool, null)
        tags                   = optional(map(string), {})
        hooks = optional(object({
          job_started   = optional(string, null)
          job_completed = optional(string, null)
        }), {})
        iam = optional(object({
          role = optional(object({
            arn = string
          }), null)
          managed_policy_arns          = optional(map(string), null)
          additional_trust_policy_json = optional(string, null)
          path                         = optional(string, null)
          permissions_boundary         = optional(string, null)
        }), {})
      }), {})

      lambda = optional(object({
        runtime            = optional(string, null)
        architecture       = optional(string, null)
        subnet_ids         = optional(list(string), null)
        security_group_ids = optional(list(string), null)
        tags               = optional(map(string), {})
        role = optional(object({
          path                 = optional(string, null)
          permissions_boundary = optional(string, null)
        }), {})
      }), {})

      orchestration_provider = object({
        webhook = optional(object({
          runner = optional(object({
            boot_time_in_minutes = optional(number, null)
            ephemeral            = optional(bool, null)
            jit_config_enabled   = optional(bool, null)
            maximum_count        = optional(number, null)
          }), {})

          github = optional(object({
            organization_runners = optional(bool, false)
          }), {})

          matcherConfig = object({
            labelMatchers           = list(list(string))
            exactMatch              = optional(bool, false)
            bidirectionalLabelMatch = optional(bool, false)
            priority                = optional(number, 999)
            enableDynamicLabels     = optional(bool, false)
            awsDynamicLabelsPolicy = optional(object({
              blocked_keys = optional(list(string), [])
              restricted_keys = optional(map(object({
                allowed = optional(list(string), [])
                denied  = optional(list(string), [])
                max     = optional(string, null)
              })), {})
            }), null)
          })

          queue = optional(object({
            delay_webhook_event            = optional(number, null)
            job_queue_retention_in_seconds = optional(number, null)
            visibility_timeout_seconds     = optional(number, null)
            redrive_build_queue = optional(object({
              enabled         = optional(bool, null)
              maxReceiveCount = optional(number, null)
            }), null)
            tags = optional(map(string), {})
          }), {})

          lambda = optional(object({
            scale = optional(object({
              up = optional(object({
                memory_size                    = optional(number, null)
                timeout                        = optional(number, null)
                reserved_concurrent_executions = optional(number, null)
                job_queued_check_enabled       = optional(bool, null)
                event_source_mapping = optional(object({
                  batch_size                         = optional(number, null)
                  maximum_batching_window_in_seconds = optional(number, null)
                }), {})
                tags = optional(map(string), {})
              }), {})
              down = optional(object({
                memory_size                     = optional(number, null)
                timeout                         = optional(number, null)
                schedule_expression             = optional(string, null)
                minimum_running_time_in_minutes = optional(number, null)
                idle_config = optional(list(object({
                  cron             = string
                  timeZone         = string
                  idleCount        = number
                  evictionStrategy = optional(string, "oldest_first")
                })), null)
                tags = optional(map(string), {})
              }), {})
            }), {})
            pool = optional(object({
              memory_size                    = optional(number, null)
              timeout                        = optional(number, null)
              reserved_concurrent_executions = optional(number, null)
              config = optional(list(object({
                schedule_expression          = string
                schedule_expression_timezone = optional(string)
                size                         = number
              })), null)
              include_busy_runners = optional(bool, null)
              runner_owner         = optional(string, null)
              tags                 = optional(map(string), {})
            }), {})
          }), {})

          job_retry = optional(object({
            enabled          = optional(bool, false)
            delay_in_seconds = optional(number, 300)
            delay_backoff    = optional(number, 2)
            max_attempts     = optional(number, 1)
            tags             = optional(map(string), {})
            lambda = optional(object({
              memory_size                    = optional(number, 256)
              reserved_concurrent_executions = optional(number, 1)
              timeout                        = optional(number, 30)
            }), {})
          }), {})

        }), null)

      })

      ssm = optional(object({
        paths = optional(object({
          root   = optional(string, null)
          tokens = optional(string, null)
          config = optional(string, null)
        }), {})
        tags = optional(map(string), {})
        parameters = optional(object({
          tags = optional(map(string), {})
        }), {})
        housekeeper = optional(object({
          schedule_expression = optional(string, null)
          state               = optional(string, null)
          tags                = optional(map(string), {})
          lambda = optional(object({
            artifact = optional(object({
              zip = optional(string, null)
              s3 = optional(object({
                key            = string
                object_version = optional(string, null)
              }), null)
            }), {})
            memory_size = optional(number, null)
            timeout     = optional(number, null)
          }), {})
          config = optional(object({
            tokenPath      = optional(string, null)
            minimumDaysOld = optional(number, null)
            dryRun         = optional(bool, null)
          }), {})
        }), {})
      }), {})

      observability = optional(object({
        logs = optional(object({
          level             = optional(string, null)
          retention_in_days = optional(number, null)
          kms_key_id        = optional(string, null)
          class             = optional(string, null)
          tags              = optional(map(string), {})
        }), {})
        tracing = optional(object({
          mode                  = optional(string, null)
          capture_http_requests = optional(bool, null)
          capture_error         = optional(bool, null)
        }), {})
        metrics = optional(object({
          enable    = optional(bool, null)
          namespace = optional(string, null)
          metric = optional(object({
            enable_github_app_rate_limit = optional(bool, null)
            enable_job_retry             = optional(bool, null)
          }), {})
        }), {})
      }), {})

      compute_provider = object({
        aws = optional(object({
          ec2 = optional(object({
            metadata_options = optional(object({
              instance_metadata_tags      = optional(string, "enabled")
              http_endpoint               = optional(string, "enabled")
              http_tokens                 = optional(string, "required")
              http_put_response_hop_limit = optional(number, 1)
            }), {})
            ami = optional(object({
              filter = optional(map(list(string)), { state = ["available"] })
              owners = optional(list(string), ["amazon"])
              id_ssm_parameter = optional(object({
                arn = string
              }), null)
              kms_key = optional(object({
                arn = string
              }), null)
            }), null)
            block_device_mappings = optional(list(object({
              delete_on_termination      = optional(bool, true)
              device_name                = optional(string, "/dev/xvda")
              encrypted                  = optional(bool, true)
              iops                       = optional(number)
              kms_key_id                 = optional(string)
              snapshot_id                = optional(string)
              throughput                 = optional(number)
              volume_initialization_rate = optional(number)
              volume_size                = number
              volume_type                = optional(string, "gp3")
              })), [{
              volume_size = 30
            }])
            create_service_linked_role_spot = optional(bool, false)
            credit_specification            = optional(string, null)
            ebs_optimized                   = optional(bool, false)
            cloudwatch_agent = optional(object({
              enabled = optional(bool, true)
              config  = optional(string, null)
            }), {})
            binaries_syncer = optional(object({
              enabled = optional(bool, null)
            }), {})
            detailed_monitoring_enabled = optional(bool, false)
            ssm_enabled                 = optional(bool, false)
            user_data = optional(object({
              enabled               = optional(bool, true)
              template              = optional(string, null)
              content               = optional(string, null)
              pre_install           = optional(string, "")
              post_install          = optional(string, "")
              debug_logging_enabled = optional(bool, false)
            }), {})
            instance_allocation_strategy   = optional(string, "lowest-price")
            instance_max_spot_price        = optional(string, null)
            instance_target_capacity_type  = optional(string, "spot")
            instance_type_priorities       = optional(map(number), null)
            instance_types                 = list(string)
            additional_security_group_ids  = optional(list(string), null)
            managed_security_group_enabled = optional(bool, null)
            egress_rules = optional(list(object({
              cidr_blocks      = list(string)
              ipv6_cidr_blocks = list(string)
              prefix_list_ids  = list(string)
              from_port        = number
              protocol         = string
              security_groups  = list(string)
              self             = bool
              to_port          = number
              description      = string
            })), null)
            instance_profile_path         = optional(string, null)
            key_name                      = optional(string, null)
            associate_public_ipv4_address = optional(bool, null)
            instance_profile = optional(object({
              name = string
            }), null)
            enable_on_demand_failover_for_errors = optional(list(string), [])
            scale_errors = optional(list(string), [
              "UnfulfillableCapacity",
              "MaxSpotInstanceCountExceeded",
              "TargetCapacityLimitExceededException",
              "RequestLimitExceeded",
              "ResourceLimitExceeded",
              "MaxSpotInstanceCountExceeded",
              "MaxSpotFleetRequestCountExceeded",
              "InsufficientInstanceCapacity",
              "InsufficientCapacityOnHost",
            ])
            subnet_ids = optional(list(string), null)
            vpc_id     = optional(string, null)
            cpu_options = optional(object({
              core_count            = optional(number)
              threads_per_core      = optional(number)
              amd_sev_snp           = optional(string)
              nested_virtualization = optional(string)
            }), null)
            placement = optional(object({
              affinity                = optional(string)
              availability_zone       = optional(string)
              group_id                = optional(string)
              group_name              = optional(string)
              host_id                 = optional(string)
              host_resource_group_arn = optional(string)
              spread_domain           = optional(string)
              tenancy                 = optional(string)
              partition_number        = optional(number)
            }), null)
            license_specifications = optional(list(object({
              license_configuration_arn = string
            })), [])
            use_dedicated_host = optional(bool, false)
            log_files = optional(list(object({
              log_group_name   = string
              prefix_log_group = bool
              file_path        = string
              log_stream_name  = string
              log_class        = optional(string, "STANDARD")
            })), null)
            tags = optional(map(string), {})
          }), null)
          microvm = optional(object({
            image_arn                   = optional(string, null)
            image_version               = optional(string, null)
            ingress_network_connectors  = optional(list(string), null)
            egress_network_connectors   = optional(list(string), null)
            maximum_duration_in_seconds = optional(number, null)
            environment_variables       = optional(map(string), {})
            iam = optional(object({
              resource_arns = optional(object({
                images = optional(list(string), null)
              }), {})
              additional_policy_json = optional(object({
                scale_up = optional(string, null)
              }), {})
              managed_policies = optional(object({
                scale_up = optional(object({
                  arn = string
                }), null)
                pool = optional(object({
                  arn = string
                }), null)
              }), {})
            }), {})
          }), null)
        }), {})
      })

    })), {})
  })
  default = {}
}
