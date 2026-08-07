resource "terraform_data" "validate_compute_provider_selection" {
  input = local.selected_provider_types

  lifecycle {
    precondition {
      condition     = length(local.selected_provider_types) == 1
      error_message = "Exactly one compute-provider block must be set. Supported compute-provider blocks: ec2, microvm."
    }
  }
}

resource "terraform_data" "validate_compute_provider_ec2" {
  count = var.compute_provider.ec2 == null ? 0 : 1
  input = var.compute_provider.ec2

  lifecycle {
    precondition {
      condition = contains(
        ["spot", "on-demand"],
        var.compute_provider.ec2.instance_target_capacity_type,
      )
      error_message = "compute_provider.ec2.instance_target_capacity_type must be spot or on-demand."
    }

    precondition {
      condition = contains(
        ["lowest-price", "diversified", "capacity-optimized", "capacity-optimized-prioritized", "price-capacity-optimized", "prioritized"],
        var.compute_provider.ec2.instance_allocation_strategy,
      )
      error_message = "compute_provider.ec2.instance_allocation_strategy is not supported."
    }

    precondition {
      condition = var.compute_provider.ec2.credit_specification == null ? true : contains(
        ["standard", "unlimited"],
        var.compute_provider.ec2.credit_specification,
      )
      error_message = "compute_provider.ec2.credit_specification must be null, standard, or unlimited."
    }

    precondition {
      condition = var.compute_provider.ec2.cpu_options == null ? true : (
        (var.compute_provider.ec2.cpu_options.amd_sev_snp == null ? true : contains(["enabled", "disabled"], var.compute_provider.ec2.cpu_options.amd_sev_snp)) &&
        (var.compute_provider.ec2.cpu_options.nested_virtualization == null ? true : contains(["enabled", "disabled"], var.compute_provider.ec2.cpu_options.nested_virtualization))
      )
      error_message = "compute_provider.ec2.cpu_options amd_sev_snp and nested_virtualization must be enabled or disabled when set."
    }

    precondition {
      condition = (
        !var.compute_provider.ec2.binaries_syncer.enabled ||
        var.compute_provider.ec2.binaries_syncer.s3 != null
      )
      error_message = "compute_provider.ec2.binaries_syncer.s3 must be set when compute_provider.ec2.binaries_syncer.enabled is true."
    }

    precondition {
      condition     = var.compute_provider.ec2.instance_profile == null || var.runner.iam.role != null
      error_message = "runner.iam.role must be set when compute_provider.ec2.instance_profile selects an external instance profile."
    }
  }
}

resource "terraform_data" "validate_compute_provider_microvm" {
  count = var.compute_provider.microvm == null ? 0 : 1
  input = var.compute_provider.microvm

  lifecycle {
    precondition {
      condition     = trimspace(var.compute_provider.microvm.image_identifier) != ""
      error_message = "compute_provider.microvm.image_identifier must not be empty."
    }

    precondition {
      condition     = length(var.compute_provider.microvm.runner_role_trust_services) > 0
      error_message = "compute_provider.microvm.runner_role_trust_services must contain at least one service principal."
    }

    precondition {
      condition = var.compute_provider.microvm.maximum_duration_in_seconds == null ? true : (
        var.compute_provider.microvm.maximum_duration_in_seconds >= 1 &&
        var.compute_provider.microvm.maximum_duration_in_seconds <= 28800
      )
      error_message = "compute_provider.microvm.maximum_duration_in_seconds must be null or between 1 and 28800."
    }

    precondition {
      condition = var.compute_provider.microvm.run_hook_payload == null ? true : (
        length(var.compute_provider.microvm.run_hook_payload) <= 16384
      )
      error_message = "compute_provider.microvm.run_hook_payload must be 16384 characters or less."
    }

    precondition {
      condition = var.compute_provider.microvm.logging == null ? true : (
        (var.compute_provider.microvm.logging.cloud_watch == null ? 0 : 1) +
        (var.compute_provider.microvm.logging.disabled ? 1 : 0) == 1
      )
      error_message = "compute_provider.microvm.logging must set exactly one of cloud_watch or disabled."
    }

    precondition {
      condition = try(var.compute_provider.microvm.iam.additional_policy_json.scale_up, null) == null ? true : (
        can(jsondecode(var.compute_provider.microvm.iam.additional_policy_json.scale_up))
      )
      error_message = "compute_provider.microvm.iam.additional_policy_json.scale_up must be valid JSON when set."
    }
  }
}
