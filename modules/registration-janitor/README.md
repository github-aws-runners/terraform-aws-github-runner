# GitHub registration janitor

Opt-in reconciliation for offline GitHub organization runner registrations left behind after their EC2 instances disappear. This complements scale-down and termination-event handling: it can discover registrations even when there are no remaining EC2 instances or a termination event was missed.

The module deploys a separate scheduled Lambda using the existing `termination-watcher.zip` archive. It does not terminate EC2 instances or delete SSM parameters. Existing module users receive no new resources or behavior unless they instantiate this module.

## Scope and rollout

Use a nonempty `runner_name_prefix` reserved exclusively for this AWS account in the configured organization and runner groups. Names must equal that prefix followed by an EC2 instance ID. Include **every AWS region** where that prefix is used. Do not use a prefix shared with another AWS account: absence in this account cannot establish that another account's instance is gone. EC2 tags alone cannot prove ownership after an instance disappears.

Start with the default `dry_run = true` and inspect the candidate logs. Set it to `false` only after verifying the scope. A GitHub App needs organization self-hosted runner read/write permissions. The Lambda supports GHES and optional additional GitHub Apps through the credential manifest described below, including quota-based selection and authentication fallback.

```hcl
module "registration_janitor" {
  source = "github-aws-runners/github-runner/aws//modules/registration-janitor"

  config = {
    prefix             = "my-account-prod"
    organization       = "example"
    runner_group_ids   = [123]
    runner_name_prefix = "my-account-prod_"
    regions            = ["eu-west-1", "us-east-1"]
    dry_run            = true

    github_app_parameters = {
      id         = { name = "/runner/app/id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/runner/app/id" }
      key_base64 = { name = "/runner/app/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/runner/app/key" }
    }
    # Set github_app_kms_key_arn when these parameters use a customer-managed key.
    # Use an archive from a release containing this handler, or build it locally.
    zip = "./termination-watcher.zip"
  }
}
```

## Additional GitHub Apps

Set `config.github_app_parameters.additional_apps_manifest` to the manifest's `{ name, arn }` reference and `additional_app_parameter_arns` to every ID, key, and optional installation-ID parameter ARN referenced by that manifest. The credential store uses the existing multi-App manifest format. All Apps must have the permissions and installation access required for the configured organization and runner groups. Include the corresponding KMS decryption access when using customer-managed keys.

Discovery selects an App for each group page; confirmation selects one for each candidate. Selection prefers the greatest observed remaining quota and skips Apps in a one-minute cooldown after throttling. Unobserved Apps begin with equal priority and use a random starting offset. App JWT and installation authentication use the same credential, with installation lookup scoped to the requested owner. Failed authentication tries another configured App. Rate-limit errors on an authenticated operation remain subject to the existing per-page or per-candidate retry behavior. With no manifest, the primary App remains the only choice.

## Confirmation and failures

Every 30 minutes by default, discovery starts a fresh scan of the configured runner groups. It processes each page immediately and checks scoped, offline, non-busy registrations individually against EC2 in every configured region. Any non-terminated instance state protects a registration. Verified candidates are queued before later pages are fetched; one candidate failure does not block others. Unavailable pages are skipped, with advancement to another group after three consecutive page failures.

Discovery is stateless: no scan cursor or completed-item list is saved. `max_candidates` bounds queued candidates (or reported candidates in dry-run), while retained instances and failed checks do not consume that limit. A deadline guard stops new work with ten seconds remaining. Later invocations list current inventory again; registrations already deleted are no longer listed. Busy, retained, or failed items may be rechecked. Inventory changes can shift pagination boundaries, and subsequent scans reconcile remaining registrations.

Candidates wait at least 15 minutes in SQS for the existing two-observation safety check. These messages contain candidate identity and observation time, not scan progress. Confirmation searches group membership page by page, stopping when the candidate is found, then rechecks EC2 absence and current GitHub identity/offline/busy state before deletion. Incomplete or failed lookups never establish absence. Scope changes invalidate candidates, and candidates older than 24 hours are discarded. Duplicate candidates are safe because deletion treats 404 as already removed.

SQS retries failed confirmations independently and routes repeated failures to the dead-letter queue. A verification failure preserves that registration while other records continue. Monitor Lambda errors and the dead-letter queue.

Dry-run logs candidates and neither enqueues confirmations nor deletes registrations, including confirmations already queued. Disabling the discovery schedule does not stop pending confirmations; set `dry_run = true` to stop deletions as well.

The delayed observations reduce launch/eventual-consistency races but do not provide an atomic transaction between GitHub and EC2. This first version supports organization runners backed by EC2 in one AWS account, across explicitly configured regions. Repository runners, other compute providers, and cross-account reconciliation are outside its scope.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.5.6 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.21 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.21 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_lambda"></a> [lambda](#module\_lambda) | ../lambda | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_cloudwatch_event_rule.schedule](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_target.schedule](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) | resource |
| [aws_iam_role_policy.cleanup](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.compute](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_lambda_event_source_mapping.confirmation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping) | resource |
| [aws_lambda_permission.schedule](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_sqs_queue.confirmation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue.dead_letter](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_iam_policy_document.cleanup](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.compute](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_config"></a> [config](#input\_config) | Opt-in GitHub registration cleanup for EC2 runners. The name prefix must be exclusive to this AWS account within the configured groups; regions must include every region using it. | <pre>object({<br/>    prefix              = string<br/>    organization        = string<br/>    runner_group_ids    = set(number)<br/>    runner_name_prefix  = string<br/>    regions             = set(string)<br/>    dry_run             = optional(bool, true)<br/>    max_candidates      = optional(number, 100)<br/>    schedule_expression = optional(string, "rate(30 minutes)")<br/>    schedule_state      = optional(string, "ENABLED")<br/>    ghes_api_url        = optional(string, "")<br/>    github_app_parameters = object({<br/>      id                            = object({ name = string, arn = string })<br/>      key_base64                    = object({ name = string, arn = string })<br/>      additional_apps_manifest      = optional(object({ name = string, arn = string }))<br/>      additional_app_parameter_arns = optional(list(string), [])<br/>    })<br/>    github_app_kms_key_arn    = optional(string)<br/>    zip                       = optional(string)<br/>    s3_bucket                 = optional(string)<br/>    s3_key                    = optional(string)<br/>    s3_object_version         = optional(string)<br/>    architecture              = optional(string, "arm64")<br/>    runtime                   = optional(string, "nodejs24.x")<br/>    memory_size               = optional(number, 512)<br/>    timeout                   = optional(number, 300)<br/>    log_level                 = optional(string, "info")<br/>    logging_retention_in_days = optional(number, 30)<br/>    logging_kms_key_id        = optional(string)<br/>    role_path                 = optional(string)<br/>    role_permissions_boundary = optional(string)<br/>    tags                      = optional(map(string), {})<br/>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_dead_letter_queue"></a> [dead\_letter\_queue](#output\_dead\_letter\_queue) | Failed confirmation messages. Inspect before redriving; candidates expire after 24 hours. |
| <a name="output_lambda"></a> [lambda](#output\_lambda) | Scheduled registration janitor Lambda resources. |
<!-- END_TF_DOCS -->

### Compute-provider integration

The scheduled janitor complements termination-watcher deregistration: it discovers registrations left behind by missed termination events, earlier failures, or resources deleted before the watcher was enabled. It does not replace event-driven cleanup or its busy-runner retries.

GitHub discovery and delayed confirmation use the `RegistrationCleanupProvider` interface in the compute-providers library. Providers interpret runner names, supply a stable inventory scope, and check one backing resource at a time. Lookup failures must throw; only a complete successful lookup may establish absence. The scope includes the provider type and settings, so changing providers or inventory scope invalidates queued observations.

EC2 is the first bundled implementation, and this Terraform module configures its regions and IAM permissions. Additional providers can register an implementation in `providers.config.registration-cleanup.ts` and supply their configuration and permissions without changing the GitHub cleanup algorithm. No inventory-wide listing or persisted scan progress is required.

### Deployment boundaries

Use one janitor deployment per compute provider and ownership scope, with a distinct resource prefix and disjoint runner-name ownership. Multiple deployments can run concurrently for different providers without combining their IAM permissions, queues, or execution budgets. This module currently bundles EC2 only; additional providers require their implementation and Terraform configuration/permissions before deployment.

`compute-ec2.tf` owns the EC2 provider configuration and region-restricted inventory policy. The shared cleanup policy covers GitHub credential access and confirmation messages only. Both policies use `aws_iam_policy_document` and attach separately to the Lambda role.
