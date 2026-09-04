locals {
  common_validation_errors = concat(
    alltrue([
      for app in var.additional_github_apps :
      (app.key_base64 != null || app.key_base64_ssm != null) &&
      (app.id != null || app.id_ssm != null)
    ]) ? [] : ["Each additional GitHub app must provide either key_base64 or key_base64_ssm, and either id or id_ssm."],
    contains(["STANDARD", "INFREQUENT_ACCESS"], var.log_class) ? [] : ["`log_class` must be either `STANDARD` or `INFREQUENT_ACCESS`."],
    contains(["first", "random", "all"], var.queue_selection_strategy) ? [] : ["`queue_selection_strategy` value not valid. Valid values are 'first', 'random', 'all'."],
    contains(["silly", "trace", "debug", "info", "warn", "error", "fatal"], var.log_level) ? [] : ["`log_level` value not valid. Valid values are 'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'."],
    contains(["arm64", "x86_64"], var.lambda_architecture) ? [] : ["`lambda_architecture` value is not valid, valid values are: `arm64` and `x86_64`."],
    contains(["ENABLED", "DISABLED", "ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS"], var.state_event_rule_binaries_syncer) ? [] : ["`state_event_rule_binaries_syncer` value is not valid, valid values are: `ENABLED`, `DISABLED`, `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS`."],
    var.queue_encryption == null || var.queue_encryption.sqs_managed_sse_enabled != null && var.queue_encryption.kms_master_key_id == null && var.queue_encryption.kms_data_key_reuse_period_seconds == null || var.queue_encryption.sqs_managed_sse_enabled == null && var.queue_encryption.kms_master_key_id != null ? [] : ["Invalid configuration for `queue_encryption`. Valid configurations are encryption disabled, enabled via SSE. Or encryption via KMS."],
    contains(["Standard", "Advanced"], var.matcher_config_parameter_store_tier) ? [] : ["`matcher_config_parameter_store_tier` value is not valid, valid values are: `Standard`, and `Advanced`."],
    !var.iam_overrides.override_instance_profile || var.iam_overrides.instance_profile_name != null ? [] : ["instance_profile_name must be provided when override_instance_profile is true."],
    !var.iam_overrides.override_runner_role || var.iam_overrides.runner_role_arn != null ? [] : ["runner_role_arn must be provided when override_runner_role is true."]
  )
}

resource "terraform_data" "validate_v1" {
  count = local.use_v2_config ? 0 : 1

  lifecycle {
    precondition {
      condition     = length(local.common_validation_errors) == 0
      error_message = join("\n", local.common_validation_errors)
    }

    precondition {
      condition = (
        (var.github_app.key_base64 != null || var.github_app.key_base64_ssm != null) &&
        (var.github_app.id != null || var.github_app.id_ssm != null) &&
        (var.github_app.webhook_secret != null || var.github_app.webhook_secret_ssm != null) &&
        var.vpc_id != null &&
        var.subnet_ids != null &&
        length(var.multi_runner_config) > 0
      )
      error_message = "Stable v1 configuration requires github_app, vpc_id, subnet_ids, and multi_runner_config."
    }
  }
}

resource "terraform_data" "validate_v2" {
  count = local.use_v2_config ? 1 : 0

  lifecycle {
    precondition {
      condition     = length(local.common_validation_errors) == 0
      error_message = join("\n", local.common_validation_errors)
    }

    precondition {
      condition = (
        (
          try(var.experimental_global_config_github.app.key_base64, null) != null ||
          try(var.experimental_global_config_github.app.key_base64_ssm, null) != null
          ) && (
          try(var.experimental_global_config_github.app.id, null) != null ||
          try(var.experimental_global_config_github.app.id_ssm, null) != null
          ) && (
          try(var.experimental_global_config_github.app.webhook_secret, null) != null ||
          try(var.experimental_global_config_github.app.webhook_secret_ssm, null) != null
        )
      )
      error_message = "Experimental v2 configuration requires a complete GitHub App under experimental_global_config_github.app."
    }

    precondition {
      condition = alltrue([
        for config in local.resolved_config.multi_runner_config : (
          try(config.orchestration_provider.webhook != null, false) &&
          try(length(config.orchestration_provider.webhook.matcherConfig.labelMatchers) > 0, false) &&
          try(config.compute_provider.aws.ec2 != null, false) &&
          try(length(config.compute_provider.aws.ec2.instance_types) > 0, false) &&
          try(config.compute_provider.aws.ec2.vpc_id != null, false) &&
          try(length(config.compute_provider.aws.ec2.subnet_ids) > 0, false)
        )
      ])
      error_message = "Each experimental v2 runner lane requires a webhook matcher, EC2 instance_types, vpc_id, and at least one subnet."
    }
  }
}
