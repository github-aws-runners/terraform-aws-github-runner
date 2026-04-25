# Best Practices

## Choose the right runner mode

## Use pre-built AMIs when possible

Pre-built AMIs can dramatically reduce runner startup time.
If you use a custom AMI, keep the runner binary and required tooling preinstalled.
If you do not want to manage AMIs, enable the runner binaries syncer and use the bundled downloader lambda.

## Reduce startup delays

Enable `runner_binaries_syncer` to cache GitHub runner binaries in S3.
Use `runner_binaries_s3_versioning` and `runner_binaries_s3_tags` to manage bucket lifecycle and ownership metadata.
Configure `lambda_architecture` as `arm64` where supported for better cost and performance.

## Keep your infrastructure secure

Use `repository_white_list` to restrict which repositories can use the GitHub App.
Use `enable_ssm_on_runners` only for debugging and disable it in production.
Avoid `enable_user_data_debug_logging_runner` in production because it logs sensitive runner bootstrap values.
Use `role_permissions_boundary` and `lambda_principals` to keep IAM permissions scoped and auditable.

## Configure cost-optimizing defaults

Keep `instance_target_capacity_type` set to `spot` unless on-demand capacity is specifically required.
Use `instance_allocation_strategy` with `capacity_optimized` or `price-capacity-optimized` for better spot instance stability.
Set `runner_boot_time_in_minutes` and `minimum_running_time_in_minutes` appropriately for job duration and instance reuse.

## Use queues and monitoring thoughtfully

Use `queue_encryption` to protect SQS message payloads at rest.
Configure `logging_retention_in_days` and `log_class` for CloudWatch logs according to your retention policy.
Enable metrics only when you need additional visibility, because it may incur extra cost.

## Feature guidance

- `enable_ami_housekeeper`: enable only when you are building and managing your own AMIs.
- `enable_runner_binaries_syncer`: enabled by default and recommended unless using a custom AMI with binaries already baked in.
- `enable_instance_termination_watcher`: useful in spot environments to track termination warnings, but keep it in beta configuration if you are still evaluating it.
- `job_retry`: only enable for ephemeral runners, and monitor GitHub API rate usage carefully.

## Deployment checklist

1. Confirm your AWS region, VPC, and subnets are configured.
2. Create or install a GitHub App with `workflow_job` permissions.
3. Choose `runner_os` and `runner_architecture` based on your workload.
4. Enable `runner_binaries_syncer` or provide a prebuilt AMI.
5. Configure `repository_white_list` or `enable_organization_runners` to limit scope.
6. Review IAM permissions and set `role_permissions_boundary` if available.
7. Validate `enable_ssm_on_runners` and debug logging settings before production rollout.

## Learn more

See the full documentation site for detailed configuration, examples, and architecture notes:

- [Getting started](getting-started.md)
- [Configuration](configuration.md)
- [Modules](modules/runners.md)
- [Examples](examples/index.md)
