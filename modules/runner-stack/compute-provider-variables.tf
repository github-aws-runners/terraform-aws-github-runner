# Typed input boundary between the common control plane and compute implementations.
variable "compute_provider" {
  description = "Typed compute-provider configuration. Provider-owned settings must remain inside the selected provider block."

  type = object({
    type = string

    ec2 = optional(object({
      ami = optional(object({
        filter               = optional(map(list(string)), { state = ["available"] })
        owners               = optional(list(string), ["amazon"])
        id_ssm_parameter_arn = optional(string, null)
        kms_key_arn          = optional(string, null)
      }), null)
      vpc_id     = string
      subnet_ids = list(string)
      overrides = optional(object({
        name_runner = optional(string, "")
        name_sg     = optional(string, "")
      }), {})
      instance_profile = optional(object({
        name = string
      }), null)
      instance_profile_path = optional(string, null)
      binaries_syncer = optional(object({
        enabled = optional(bool, true)
        s3 = optional(object({
          arn = string
          id  = string
          key = string
        }), null)
      }), {})
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
      })), [{ volume_size = 30 }])
      ebs_optimized                 = optional(bool, false)
      instance_target_capacity_type = optional(string, "spot")
      instance_allocation_strategy  = optional(string, "lowest-price")
      instance_type_priorities      = optional(map(number), null)
      instance_max_spot_price       = optional(string, null)
      instance_types                = list(string)
      user_data = optional(object({
        enabled               = optional(bool, true)
        template              = optional(string, null)
        content               = optional(string, null)
        pre_install           = optional(string, "")
        post_install          = optional(string, "")
        debug_logging_enabled = optional(bool, false)
      }), {})
      ssm_enabled                     = optional(bool, false)
      create_service_linked_role_spot = optional(bool, false)
      cloudwatch_agent = optional(object({
        enabled = optional(bool, true)
        config  = optional(string, null)
      }), {})
      managed_security_group_enabled = optional(bool, true)
      log_files = optional(list(object({
        log_group_name   = string
        prefix_log_group = bool
        file_path        = string
        log_stream_name  = string
        log_class        = optional(string, "STANDARD")
      })), null)
      key_name                      = optional(string, null)
      additional_security_group_ids = optional(list(string), [])
      detailed_monitoring_enabled   = optional(bool, false)
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
      tags = optional(map(string), {})
      metadata_options = optional(object({
        instance_metadata_tags      = optional(string, "enabled")
        http_endpoint               = optional(string, "enabled")
        http_tokens                 = optional(string, "required")
        http_put_response_hop_limit = optional(number, 1)
      }), {})
      credit_specification = optional(string, null)
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
      associate_public_ipv4_address        = optional(bool, false)
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
      use_dedicated_host = optional(bool, false)
    }), null)
  })

  validation {
    condition     = contains(["ec2"], lower(trimspace(var.compute_provider.type)))
    error_message = "Supported compute providers: ec2."
  }

  validation {
    condition     = lower(trimspace(var.compute_provider.type)) != "ec2" || var.compute_provider.ec2 != null
    error_message = "compute_provider.ec2 must be set when compute_provider.type is ec2."
  }

  validation {
    condition = var.compute_provider.ec2 == null ? true : contains(
      ["spot", "on-demand"],
      var.compute_provider.ec2.instance_target_capacity_type,
    )
    error_message = "compute_provider.ec2.instance_target_capacity_type must be spot or on-demand."
  }

  validation {
    condition = var.compute_provider.ec2 == null ? true : contains(
      ["lowest-price", "diversified", "capacity-optimized", "capacity-optimized-prioritized", "price-capacity-optimized", "prioritized"],
      var.compute_provider.ec2.instance_allocation_strategy,
    )
    error_message = "compute_provider.ec2.instance_allocation_strategy is not supported."
  }

  validation {
    condition = var.compute_provider.ec2 == null ? true : (
      var.compute_provider.ec2.credit_specification == null ? true : contains(
        ["standard", "unlimited"],
        var.compute_provider.ec2.credit_specification,
      )
    )
    error_message = "compute_provider.ec2.credit_specification must be null, standard, or unlimited."
  }

  validation {
    condition = var.compute_provider.ec2 == null ? true : (
      var.compute_provider.ec2.cpu_options == null ? true : (
        (var.compute_provider.ec2.cpu_options.amd_sev_snp == null ? true : contains(["enabled", "disabled"], var.compute_provider.ec2.cpu_options.amd_sev_snp)) &&
        (var.compute_provider.ec2.cpu_options.nested_virtualization == null ? true : contains(["enabled", "disabled"], var.compute_provider.ec2.cpu_options.nested_virtualization))
      )
    )
    error_message = "compute_provider.ec2.cpu_options amd_sev_snp and nested_virtualization must be enabled or disabled when set."
  }

  validation {
    condition = var.compute_provider.ec2 == null ? true : (
      !var.compute_provider.ec2.binaries_syncer.enabled || var.compute_provider.ec2.binaries_syncer.s3 != null
    )
    error_message = "compute_provider.ec2.binaries_syncer.s3 must be set when compute_provider.ec2.binaries_syncer.enabled is true."
  }
}
