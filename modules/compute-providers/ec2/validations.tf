resource "terraform_data" "validate_config" {
  lifecycle {
    precondition {
      condition     = contains(["spot", "on-demand"], var.config.instance_target_capacity_type)
      error_message = "compute_provider.ec2.instance_target_capacity_type must be spot or on-demand."
    }

    precondition {
      condition = contains(
        ["lowest-price", "diversified", "capacity-optimized", "capacity-optimized-prioritized", "price-capacity-optimized", "prioritized"],
        var.config.instance_allocation_strategy,
      )
      error_message = "compute_provider.ec2.instance_allocation_strategy is not supported."
    }

    precondition {
      condition     = var.config.credit_specification == null ? true : contains(["standard", "unlimited"], var.config.credit_specification)
      error_message = "compute_provider.ec2.credit_specification must be null, standard, or unlimited."
    }

    precondition {
      condition = var.config.cpu_options == null ? true : (
        (var.config.cpu_options.amd_sev_snp == null ? true : contains(["enabled", "disabled"], var.config.cpu_options.amd_sev_snp)) &&
        (var.config.cpu_options.nested_virtualization == null ? true : contains(["enabled", "disabled"], var.config.cpu_options.nested_virtualization))
      )
      error_message = "compute_provider.ec2.cpu_options amd_sev_snp and nested_virtualization must be enabled or disabled when set."
    }

    precondition {
      condition     = !var.config.binaries_syncer.enabled || var.config.binaries_syncer.s3 != null
      error_message = "compute_provider.ec2.binaries_syncer.s3 must be set when compute_provider.ec2.binaries_syncer.enabled is true."
    }

    precondition {
      condition     = var.config.instance_profile == null || !var.runner.iam.role.managed
      error_message = "runner.iam.role must be set when compute_provider.ec2.instance_profile selects an external instance profile."
    }
  }
}
