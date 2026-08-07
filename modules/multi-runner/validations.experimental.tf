locals {
  experimental_multi_runner_config_v2_provider_types = {
    for runner_key, runner_config in var.experimental.multi_runner_config_v2 : runner_key => [
      for provider_type, provider_config in runner_config.compute_provider : provider_type
      if provider_config != null
    ]
  }

  experimental_multi_runner_config_v2_validations = {
    for runner_key, runner_config in var.experimental.multi_runner_config_v2 : runner_key => {
      provider_type = length(local.experimental_multi_runner_config_v2_provider_types[runner_key]) == 1 ? local.experimental_multi_runner_config_v2_provider_types[runner_key][0] : null

      compute_provider_selection = length(local.experimental_multi_runner_config_v2_provider_types[runner_key]) == 1

      runner_external_role_managed_policies = (
        runner_config.runner.iam.role == null ||
        length(runner_config.runner.iam.managed_policy_arns) == 0
      )

      ec2_instance_profile_role = (
        runner_config.compute_provider.ec2 == null ? true : (
          runner_config.compute_provider.ec2.instance_profile == null ||
          runner_config.runner.iam.role != null
        )
      )

      microvm_image_identifier = (
        runner_config.compute_provider.microvm == null ? true :
        trimspace(runner_config.compute_provider.microvm.image_identifier) != ""
      )

      microvm_runner_role_trust_services = (
        runner_config.compute_provider.microvm == null ? true :
        length(runner_config.compute_provider.microvm.runner_role_trust_services) > 0
      )

      microvm_maximum_duration = (
        runner_config.compute_provider.microvm == null ? true : (
          runner_config.compute_provider.microvm.maximum_duration_in_seconds == null ? true : (
            runner_config.compute_provider.microvm.maximum_duration_in_seconds >= 1 &&
            runner_config.compute_provider.microvm.maximum_duration_in_seconds <= 28800
          )
        )
      )

      microvm_run_hook_payload = (
        runner_config.compute_provider.microvm == null ? true : (
          runner_config.compute_provider.microvm.run_hook_payload == null ? true :
          length(runner_config.compute_provider.microvm.run_hook_payload) <= 16384
        )
      )

      microvm_logging = (
        runner_config.compute_provider.microvm == null ? true : (
          runner_config.compute_provider.microvm.logging == null ? true : (
            (runner_config.compute_provider.microvm.logging.cloud_watch == null ? 0 : 1) +
            (runner_config.compute_provider.microvm.logging.disabled ? 1 : 0) == 1
          )
        )
      )
    }
  }

  experimental_multi_runner_config_v2_valid_runner_stack_keys = toset([
    for runner_key, validation in local.experimental_multi_runner_config_v2_validations : runner_key
    if validation.compute_provider_selection &&
    validation.runner_external_role_managed_policies &&
    validation.ec2_instance_profile_role &&
    validation.microvm_image_identifier &&
    validation.microvm_runner_role_trust_services &&
    validation.microvm_maximum_duration &&
    validation.microvm_run_hook_payload &&
    validation.microvm_logging
  ])
}

resource "terraform_data" "validate_experimental_v2_compute_provider_selection" {
  input = local.experimental_multi_runner_config_v2_provider_types

  lifecycle {
    precondition {
      condition = alltrue([
        for validation in local.experimental_multi_runner_config_v2_validations :
        validation.compute_provider_selection
      ])
      error_message = "Each experimental runner configuration must set exactly one compute-provider block. Supported compute-provider blocks: ec2, microvm."
    }
  }
}

resource "terraform_data" "validate_experimental_v2_runner_iam" {
  input = {
    for runner_key, runner_config in var.experimental.multi_runner_config_v2 : runner_key => runner_config.runner.iam
  }

  lifecycle {
    precondition {
      condition = alltrue([
        for validation in local.experimental_multi_runner_config_v2_validations :
        validation.runner_external_role_managed_policies
      ])
      error_message = "runner.iam.managed_policy_arns cannot be set with an external runner.iam.role because external roles are not managed by this module."
    }
  }
}

resource "terraform_data" "validate_experimental_v2_ec2" {
  for_each = {
    for runner_key, runner_config in var.experimental.multi_runner_config_v2 : runner_key => runner_config
    if runner_config.compute_provider.ec2 != null
  }

  input = each.value.compute_provider.ec2

  lifecycle {
    precondition {
      condition     = local.experimental_multi_runner_config_v2_validations[each.key].ec2_instance_profile_role
      error_message = "runner.iam.role must be set when compute_provider.ec2.instance_profile selects an external instance profile."
    }
  }
}

resource "terraform_data" "validate_experimental_v2_microvm" {
  for_each = {
    for runner_key, runner_config in var.experimental.multi_runner_config_v2 : runner_key => runner_config
    if runner_config.compute_provider.microvm != null
  }

  input = each.value.compute_provider.microvm

  lifecycle {
    precondition {
      condition     = local.experimental_multi_runner_config_v2_validations[each.key].microvm_image_identifier
      error_message = "compute_provider.microvm.image_identifier must not be empty."
    }

    precondition {
      condition     = local.experimental_multi_runner_config_v2_validations[each.key].microvm_runner_role_trust_services
      error_message = "compute_provider.microvm.runner_role_trust_services must contain at least one service principal."
    }

    precondition {
      condition     = local.experimental_multi_runner_config_v2_validations[each.key].microvm_maximum_duration
      error_message = "compute_provider.microvm.maximum_duration_in_seconds must be null or between 1 and 28800."
    }

    precondition {
      condition     = local.experimental_multi_runner_config_v2_validations[each.key].microvm_run_hook_payload
      error_message = "compute_provider.microvm.run_hook_payload must be 16384 characters or less."
    }

    precondition {
      condition     = local.experimental_multi_runner_config_v2_validations[each.key].microvm_logging
      error_message = "compute_provider.microvm.logging must set exactly one of cloud_watch or disabled."
    }
  }
}
