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
      error_message = "Exactly one orchestration provider must be configured. Supported providers: webhook and scale_set."
    }

    precondition {
      condition     = var.orchestration_provider.scale_set == null ? true : local.provider_contract.capabilities.scale_set != null
      error_message = "The selected compute provider must expose a scale_set capability when scale_set orchestration is selected."
    }

    precondition {
      condition = var.orchestration_provider.scale_set == null ? true : (
        local.provider_key == "aws_ec2" ? length(setintersection(
          toset(keys(merge(var.tags, var.compute_provider.aws.ec2.tags))),
          local.scale_set_ec2_reserved_runner_tag_keys,
        )) == 0 : true
      )
      error_message = "Scale-set runner tags must not set provider-owned ownership or lifecycle keys."
    }

    precondition {
      condition = !local.scale_set_ec2_selected ? true : (
        length(var.runner.name_prefix) <= 45 &&
        length(regexall("[^A-Za-z0-9._-]", var.runner.name_prefix)) == 0
      )
      error_message = "Scale-set EC2 runner.name_prefix must contain at most 45 ASCII letters, digits, dots, underscores, or hyphens."
    }

    precondition {
      condition = !local.scale_set_ec2_selected ? true : (
        var.compute_provider.aws.ec2.instance_target_capacity_type == "spot" ||
        contains(
          ["lowest-price", "prioritized"],
          var.compute_provider.aws.ec2.instance_allocation_strategy,
        )
      )
      error_message = "Scale-set EC2 on-demand capacity supports only lowest-price or prioritized instance allocation strategies."
    }

    precondition {
      condition = !local.scale_set_ec2_selected ? true : alltrue([
        for values in [
          var.compute_provider.aws.ec2.subnet_ids,
          var.compute_provider.aws.ec2.instance_types,
          var.compute_provider.aws.ec2.enable_on_demand_failover_for_errors,
          var.compute_provider.aws.ec2.scale_errors,
        ] : length(values) <= 100 && length(values) == length(distinct(values))
      ])
      error_message = "Scale-set EC2 subnet_ids, instance_types, enable_on_demand_failover_for_errors, and scale_errors must each contain at most 100 unique values."
    }

    precondition {
      condition = !local.scale_set_ec2_selected ? true : (
        var.compute_provider.aws.ec2.instance_type_priorities == null ? true : alltrue([
          for priority in values(var.compute_provider.aws.ec2.instance_type_priorities) : (
            priority >= 0 &&
            priority <= 1000 &&
            floor(priority) == priority
          )
        ])
      )
      error_message = "Scale-set EC2 instance_type_priorities values must be integers from 0 through 1000."
    }

    precondition {
      condition = !local.scale_set_ec2_selected ? true : (
        length(local.scale_set_ec2_ssm_parameter_tags) <= 45 &&
        alltrue([
          for key, value in local.scale_set_ec2_ssm_parameter_tags : (
            length(key) >= 1 &&
            length(key) <= 128 &&
            length(regexall("[^A-Za-z0-9_.:/=+@-]", key)) == 0 &&
            !startswith(lower(key), "aws:") &&
            length(value) <= 256 &&
            length(regexall("[[:cntrl:]]", value)) == 0
          )
        ])
      )
      error_message = "Scale-set EC2 Parameter Store tags must contain at most 45 entries with runtime-compatible keys and values."
    }

    precondition {
      condition = (!local.scale_set_ec2_selected || local.scale_set_ec2_external_ami_parameter_arn == null) ? true : (
        local.scale_set_ec2_external_ami_parameter_name == null ? false : (
          length(local.scale_set_ec2_external_ami_parameter_name) <= 900 &&
          !strcontains(local.scale_set_ec2_external_ami_parameter_name, "//")
        )
      )
      error_message = "Scale-set EC2 external AMI parameters must use an exact same-account, same-region SSM parameter ARN whose extracted absolute name matches the runtime grammar."
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
