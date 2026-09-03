resource "terraform_data" "validate_config" {
  lifecycle {
    precondition {
      condition     = contains(["linux", "osx", "windows"], var.runner.os)
      error_message = "Valid values for runner.os are linux, osx, and windows."
    }

    precondition {
      condition     = length(var.runner.name_prefix) <= 45
      error_message = "runner.name_prefix must be at most 45 characters."
    }

    precondition {
      condition     = var.runner.iam.role == null ? true : trimspace(var.runner.iam.role.arn) != ""
      error_message = "runner.iam.role.arn must be a non-empty ARN when set."
    }

    precondition {
      condition     = var.runner.iam.role == null || length(var.runner.iam.managed_policy_arns) == 0
      error_message = "runner.iam.managed_policy_arns cannot be set with an external runner.iam.role because external roles are not managed by this module."
    }

    precondition {
      condition     = var.runner.iam.additional_trust_policy_json == null ? true : can(jsondecode(var.runner.iam.additional_trust_policy_json))
      error_message = "runner.iam.additional_trust_policy_json must be valid JSON when set."
    }

    precondition {
      condition     = var.runner.iam.role == null || var.runner.iam.additional_trust_policy_json == null
      error_message = "runner.iam.additional_trust_policy_json cannot be set with an external runner.iam.role because external role trust is not managed by this module."
    }

    precondition {
      condition     = contains(["arm64", "x86_64"], var.lambda.architecture)
      error_message = "lambda.architecture must be arm64 or x86_64."
    }

    precondition {
      condition = !(
        var.ssm.housekeeper.lambda.artifact.zip != null &&
        var.ssm.housekeeper.lambda.artifact.s3 != null
      )
      error_message = "ssm.housekeeper.lambda.artifact must select at most one of zip or s3."
    }

    precondition {
      condition = (
        var.ssm.housekeeper.lambda.artifact.s3 == null ||
        var.lambda.artifact.s3.bucket != null
      )
      error_message = "lambda.artifact.s3.bucket must be set when ssm.housekeeper.lambda.artifact.s3 is selected."
    }

    precondition {
      condition     = contains(["STANDARD", "INFREQUENT_ACCESS"], var.observability.logs.class)
      error_message = "observability.logs.class must be STANDARD or INFREQUENT_ACCESS."
    }

    precondition {
      condition = contains([
        "silly",
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
      ], var.observability.logs.level)
      error_message = "observability.logs.level must be one of silly, trace, debug, info, warn, error, or fatal."
    }

    precondition {
      condition = length([
        for provider_key, provider_config in local.compute_providers : provider_key
        if provider_config != null
      ]) == 1
      error_message = "Exactly one compute-provider block must be set. Supported compute-provider blocks: aws.ec2."
    }

    precondition {
      condition = var.compute_provider_key == null || try(
        local.compute_providers[var.compute_provider_key] != null,
        false,
      )
      error_message = "compute_provider_key must identify the non-null typed compute-provider block."
    }

    precondition {
      condition = length([
        for provider_name, provider_config in var.orchestration_provider : provider_name
        if provider_config != null
      ]) == 1
      error_message = "Exactly one orchestration provider must be configured. Supported providers: webhook."
    }

    precondition {
      condition = var.orchestration_provider.webhook == null ? true : (
        var.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.batch_size >= 1 &&
        var.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.batch_size <= 1000 &&
        var.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds >= 0 &&
        var.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds <= 300
      )
      error_message = "orchestration_provider.webhook.lambda.scale.up.event_source_mapping batch size must be between 1 and 1000 and its batching window between 0 and 300 seconds."
    }

    precondition {
      condition = var.orchestration_provider.webhook == null ? true : !(
        var.orchestration_provider.webhook.lambda.artifact.zip != null &&
        var.orchestration_provider.webhook.lambda.artifact.s3 != null
      )
      error_message = "orchestration_provider.webhook.lambda.artifact must select at most one of zip or s3."
    }

    precondition {
      condition     = var.orchestration_provider.webhook == null ? true : (!var.orchestration_provider.webhook.job_retry.enabled || var.orchestration_provider.webhook.job_retry.delay_in_seconds <= 900)
      error_message = "orchestration_provider.webhook.job_retry.delay_in_seconds cannot exceed the SQS maximum of 900 seconds."
    }
  }
}
