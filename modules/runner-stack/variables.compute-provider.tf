# Typed compute-provider input boundary between the common control plane and compute implementations.
variable "compute_provider" {
  description = <<-EOT
    Typed compute-provider configuration. Provider-owned settings remain inside the selected compute-provider block.

    Exactly one compute-provider block must be non-null. The populated block selects the provider, and its presence must be known during planning. Values inside the selected block may remain unknown until apply.

    - `ec2`: EC2 compute-provider configuration.
    - `ec2.ami`: Optional AMI discovery or external AMI-parameter configuration. Null uses the operating-system and architecture defaults.
    - `ec2.ami.filter`: EC2 AMI filters combined with the provider's default AMI-name filter.
    - `ec2.ami.owners`: AWS account IDs or aliases allowed to own the selected AMI.
    - `ec2.ami.id_ssm_parameter`: Optional externally managed SSM parameter containing the AMI ID. Null creates a provider-managed AMI-ID parameter. The wrapper's presence is the plan-time ownership discriminator, so keep the object literal even when its ARN comes from another resource.
    - `ec2.ami.id_ssm_parameter.arn`: ARN of the externally managed SSM parameter. The ARN may be unknown until apply.
    - `ec2.ami.kms_key`: Optional KMS key required to launch encrypted AMIs or snapshots. The wrapper's presence is the plan-time policy discriminator.
    - `ec2.ami.kms_key.arn`: ARN of the KMS key. The ARN may be unknown until apply.
    - `ec2.vpc_id`: VPC in which runner networking resources are created.
    - `ec2.subnet_ids`: Subnets from which scale-up may launch runner instances.
    - `ec2.overrides`: Optional resource-name overrides.
    - `ec2.overrides.name_runner`: Name tag used for runner compute resources. An empty value uses the generated provider name.
    - `ec2.overrides.name_sg`: Name tag used for the managed runner security group. An empty value uses the generated provider name.
    - `ec2.instance_profile`: Optional externally managed instance profile used by the launch template.
    - `ec2.instance_profile.name`: Name of the externally managed instance profile.
    - `ec2.instance_profile_path`: IAM path for the provider-managed instance profile. Null uses a path derived from the stack prefix.
    - `ec2.binaries_syncer`: Runner-distribution synchronization configuration.
    - `ec2.binaries_syncer.enabled`: Enables use of a synchronized runner distribution from S3.
    - `ec2.binaries_syncer.s3`: S3 object containing the synchronized runner distribution. Required when synchronization is enabled.
    - `ec2.binaries_syncer.s3.arn`: ARN of the runner-distribution bucket, used by IAM policies.
    - `ec2.binaries_syncer.s3.id`: Bucket name used to construct the runner-distribution S3 URI.
    - `ec2.binaries_syncer.s3.key`: Object key of the runner distribution.
    - `ec2.block_device_mappings`: EBS mappings added to the runner launch template.
    - `ec2.block_device_mappings[].delete_on_termination`: Deletes the volume when its runner instance terminates.
    - `ec2.block_device_mappings[].device_name`: Device name exposed to the runner instance.
    - `ec2.block_device_mappings[].encrypted`: Enables EBS encryption.
    - `ec2.block_device_mappings[].iops`: Provisioned IOPS for volume types that support it.
    - `ec2.block_device_mappings[].kms_key_id`: KMS key ID or ARN used to encrypt the volume.
    - `ec2.block_device_mappings[].snapshot_id`: Snapshot used to initialize the volume.
    - `ec2.block_device_mappings[].throughput`: Provisioned throughput for volume types that support it.
    - `ec2.block_device_mappings[].volume_initialization_rate`: Fixed initialization rate in MiB/s for supported snapshot-backed volumes.
    - `ec2.block_device_mappings[].volume_size`: Volume size in GiB.
    - `ec2.block_device_mappings[].volume_type`: EBS volume type.
    - `ec2.ebs_optimized`: Requests EBS-optimized runner instances.
    - `ec2.instance_target_capacity_type`: Primary capacity type, either `spot` or `on-demand`.
    - `ec2.instance_allocation_strategy`: EC2 Fleet allocation strategy used to select instance capacity.
    - `ec2.instance_type_priorities`: Optional numeric priorities keyed by instance type.
    - `ec2.instance_max_spot_price`: Optional maximum hourly Spot price.
    - `ec2.instance_types`: EC2 instance types available to the scale-up and pool functions.
    - `ec2.user_data`: Runner bootstrap user-data configuration.
    - `ec2.user_data.enabled`: Enables launch-template user data.
    - `ec2.user_data.template`: Optional path to a custom user-data template.
    - `ec2.user_data.content`: Optional complete user-data content. When set, it is used instead of rendering a template.
    - `ec2.user_data.pre_install`: Script content inserted before runner installation in the default template.
    - `ec2.user_data.post_install`: Script content inserted after runner installation in the default template.
    - `ec2.user_data.debug_logging_enabled`: Enables verbose user-data tracing, which can expose secrets in logs.
    - `ec2.ssm_enabled`: Attaches runner permissions and policies required for AWS Systems Manager access.
    - `ec2.create_service_linked_role_spot`: Allows scale-up to create the EC2 Spot service-linked role.
    - `ec2.cloudwatch_agent`: CloudWatch agent configuration for runner instances.
    - `ec2.cloudwatch_agent.enabled`: Installs and configures the CloudWatch agent through the default bootstrap flow.
    - `ec2.cloudwatch_agent.config`: Optional complete CloudWatch agent configuration. Null renders the provider default from `log_files`.
    - `ec2.managed_security_group_enabled`: Creates and attaches the provider-managed runner security group.
    - `ec2.log_files`: Optional log files collected by the CloudWatch agent. Null uses the provider defaults.
    - `ec2.log_files[].log_group_name`: CloudWatch log-group name, before optional prefixing.
    - `ec2.log_files[].prefix_log_group`: Prefixes the log-group name with the runner stack path when true.
    - `ec2.log_files[].file_path`: File or glob read by the CloudWatch agent.
    - `ec2.log_files[].log_stream_name`: CloudWatch log-stream name template.
    - `ec2.log_files[].log_class`: CloudWatch log-group class for the collected file.
    - `ec2.key_name`: Optional EC2 key-pair name added to the launch template.
    - `ec2.additional_security_group_ids`: Existing security groups attached in addition to the managed security group.
    - `ec2.detailed_monitoring_enabled`: Enables detailed EC2 monitoring for runner instances.
    - `ec2.egress_rules`: Egress rules created on the managed runner security group.
    - `ec2.egress_rules[].cidr_blocks`: IPv4 CIDR destinations.
    - `ec2.egress_rules[].ipv6_cidr_blocks`: IPv6 CIDR destinations.
    - `ec2.egress_rules[].prefix_list_ids`: AWS prefix-list destinations.
    - `ec2.egress_rules[].from_port`: First destination port in the permitted range.
    - `ec2.egress_rules[].protocol`: IP protocol name or number. Use `-1` for all protocols.
    - `ec2.egress_rules[].security_groups`: Destination security-group IDs.
    - `ec2.egress_rules[].self`: Allows traffic to the managed security group itself when true.
    - `ec2.egress_rules[].to_port`: Last destination port in the permitted range.
    - `ec2.egress_rules[].description`: Optional rule description.
    - `ec2.tags`: Additional tags for runner instances, EBS volumes, network interfaces, and eligible Spot instance requests created from the launch template. They override module-level tags and the generated runner `Name`; the provider-managed `ghr:environment`, `ghr:ssm_config_path`, and `ghr:runner_name_prefix` bootstrap tags take final precedence. These tags do not apply to static provider resources such as the launch template, security group, IAM resources, SSM parameters, or log groups.
    - `ec2.metadata_options`: Instance Metadata Service configuration in the launch template.
    - `ec2.metadata_options.instance_metadata_tags`: Exposes instance tags through Instance Metadata Service when `enabled`.
    - `ec2.metadata_options.http_endpoint`: Enables or disables the Instance Metadata Service endpoint.
    - `ec2.metadata_options.http_tokens`: Controls whether IMDSv2 session tokens are optional or required.
    - `ec2.metadata_options.http_put_response_hop_limit`: Network hop limit for Instance Metadata Service token responses.
    - `ec2.credit_specification`: CPU credit mode for burstable instance types, either `standard` or `unlimited`.
    - `ec2.cpu_options`: CPU topology and processor-feature configuration.
    - `ec2.cpu_options.core_count`: Number of CPU cores exposed to the runner instance.
    - `ec2.cpu_options.threads_per_core`: Number of hardware threads exposed per CPU core.
    - `ec2.cpu_options.amd_sev_snp`: Enables or disables AMD SEV-SNP on supported instance types.
    - `ec2.cpu_options.nested_virtualization`: Enables or disables nested virtualization on supported instance types.
    - `ec2.placement`: EC2 placement configuration for runner instances.
    - `ec2.placement.affinity`: Host affinity setting.
    - `ec2.placement.availability_zone`: Availability Zone in which the instance is placed.
    - `ec2.placement.group_id`: Placement-group ID.
    - `ec2.placement.group_name`: Placement-group name.
    - `ec2.placement.host_id`: Dedicated Host ID.
    - `ec2.placement.host_resource_group_arn`: ARN of the host resource group used for placement.
    - `ec2.placement.spread_domain`: Spread-domain placement value.
    - `ec2.placement.tenancy`: Instance tenancy, such as `default`, `dedicated`, or `host`.
    - `ec2.placement.partition_number`: Placement-group partition number.
    - `ec2.license_specifications`: License Manager configurations added to the launch template.
    - `ec2.license_specifications[].license_configuration_arn`: ARN of a License Manager license configuration.
    - `ec2.associate_public_ipv4_address`: Associates a public IPv4 address with runner network interfaces.
    - `ec2.enable_on_demand_failover_for_errors`: EC2 error codes that trigger an on-demand fallback after a Spot launch failure.
    - `ec2.scale_errors`: EC2 error codes treated as retryable scale-up failures.
    - `ec2.use_dedicated_host`: Enables the dedicated-host launch path, required for macOS runners.
    - `microvm`: Lambda MicroVM compute-provider configuration.
    - `microvm.image_identifier`: ARN or ID of the MicroVM image used to run GitHub runners.
    - `microvm.image_version`: Optional MicroVM image version.
    - `microvm.execution_role.arn`: Optional externally managed execution role assumed by MicroVMs. Null uses the common runner role.
    - `microvm.runner_role_trust_services`: Service principals trusted by the common runner role when it is used as the MicroVM execution role.
    - `microvm.egress_network_connectors`: Egress network connectors passed to RunMicrovm.
    - `microvm.idle_policy`: Optional auto-suspend and auto-resume configuration passed to RunMicrovm.
    - `microvm.logging`: Optional RunMicrovm logging union. Exactly one of `cloud_watch` or `disabled` must be selected when set.
    - `microvm.run_hook_payload`: Optional payload delivered to the MicroVM `/run` hook. Maximum 16,384 characters.
    - `microvm.maximum_duration_in_seconds`: Optional maximum MicroVM lifetime. Valid range is 1 through 28,800 seconds.
    - `microvm.environment_variables`: Additional provider-specific Lambda environment variables merged into scale-up, scale-down, and pool.
    - `microvm.tags`: Tags encoded into the MicroVM runner configuration.
    - `microvm.iam`: Optional MicroVM control-plane IAM overrides and managed policy attachments.
  EOT

  type = object({
    ec2 = optional(object({
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

    microvm = optional(object({
      image_identifier = string
      image_version    = optional(string, null)
      execution_role = optional(object({
        arn = string
      }), null)
      runner_role_trust_services = optional(list(string), ["lambda.amazonaws.com"])
      egress_network_connectors  = optional(list(string), [])
      idle_policy = optional(object({
        max_idle_duration_seconds  = number
        suspended_duration_seconds = number
        auto_resume_enabled        = bool
      }), null)
      logging = optional(object({
        cloud_watch = optional(object({
          log_group  = optional(string, null)
          log_stream = optional(string, null)
        }), null)
        disabled = optional(bool, false)
      }), null)
      run_hook_payload            = optional(string, null)
      maximum_duration_in_seconds = optional(number, null)
      environment_variables       = optional(map(string), {})
      tags                        = optional(map(string), {})
      iam = optional(object({
        resource_arns = optional(list(string), ["*"])
        actions = optional(object({
          scale_up   = optional(list(string), null)
          scale_down = optional(list(string), null)
        }), {})
        additional_policy_json = optional(object({
          scale_up = optional(string, null)
        }), {})
        managed_policy_arns = optional(object({
          scale_up = optional(string, null)
          pool     = optional(string, null)
        }), {})
      }), {})
    }), null)
  })

}
