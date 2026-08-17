# Optional plan-known dispatch key supplied by the multi-runner topology layer.
variable "compute_provider_key" {
  description = "Optional plan-known compute-provider dispatch key. Null discovers the key from the exactly one populated compute_provider block."
  type        = string
  default     = null

  validation {
    condition     = var.compute_provider_key == null ? true : contains(["aws_ec2", "aws_microvm"], var.compute_provider_key)
    error_message = "compute_provider_key must be null, aws_ec2, or aws_microvm."
  }
}

# Typed compute-provider input boundary between the common control plane and compute implementations.
variable "compute_provider" {
  description = <<-EOT
    Typed compute-provider configuration. Provider-owned settings remain inside the selected compute-provider block.

    Exactly one compute-provider block must be non-null. The populated block selects the provider, and its presence must be known during planning. Values inside the selected block may remain unknown until apply.

    - `aws`: AWS compute-provider configurations.
    - `aws.ec2`: EC2 compute-provider configuration.
    - `aws.ec2.ami`: Optional AMI discovery or external AMI-parameter configuration. Null uses the operating-system and architecture defaults.
    - `aws.ec2.ami.filter`: EC2 AMI filters combined with the provider's default AMI-name filter.
    - `aws.ec2.ami.owners`: AWS account IDs or aliases allowed to own the selected AMI.
    - `aws.ec2.ami.id_ssm_parameter`: Optional externally managed SSM parameter containing the AMI ID. Null creates a provider-managed AMI-ID parameter. The wrapper's presence is the plan-time ownership discriminator, so keep the object literal even when its ARN comes from another resource.
    - `aws.ec2.ami.id_ssm_parameter.arn`: ARN of the externally managed SSM parameter. The ARN may be unknown until apply.
    - `aws.ec2.ami.kms_key`: Optional KMS key required to launch encrypted AMIs or snapshots. The wrapper's presence is the plan-time policy discriminator.
    - `aws.ec2.ami.kms_key.arn`: ARN of the KMS key. The ARN may be unknown until apply.
    - `aws.ec2.vpc_id`: VPC in which runner networking resources are created.
    - `aws.ec2.subnet_ids`: Subnets from which scale-up may launch runner instances.
    - `aws.ec2.overrides`: Optional resource-name overrides.
    - `aws.ec2.overrides.name_runner`: Name tag used for runner compute resources. An empty value uses the generated provider name.
    - `aws.ec2.overrides.name_sg`: Name tag used for the managed runner security group. An empty value uses the generated provider name.
    - `aws.ec2.instance_profile`: Optional externally managed instance profile used by the launch template.
    - `aws.ec2.instance_profile.name`: Name of the externally managed instance profile.
    - `aws.ec2.instance_profile_path`: IAM path for the provider-managed instance profile. Null uses a path derived from the runner-configuration prefix.
    - `aws.ec2.binaries_syncer`: Runner-distribution synchronization configuration.
    - `aws.ec2.binaries_syncer.enabled`: Enables use of a synchronized runner distribution from S3.
    - `aws.ec2.binaries_syncer.s3`: S3 object containing the synchronized runner distribution. Required when synchronization is enabled.
    - `aws.ec2.binaries_syncer.s3.arn`: ARN of the runner-distribution bucket, used by IAM policies.
    - `aws.ec2.binaries_syncer.s3.id`: Bucket name used to construct the runner-distribution S3 URI.
    - `aws.ec2.binaries_syncer.s3.key`: Object key of the runner distribution.
    - `aws.ec2.block_device_mappings`: EBS mappings added to the runner launch template.
    - `aws.ec2.block_device_mappings[].delete_on_termination`: Deletes the volume when its runner instance terminates.
    - `aws.ec2.block_device_mappings[].device_name`: Device name exposed to the runner instance.
    - `aws.ec2.block_device_mappings[].encrypted`: Enables EBS encryption.
    - `aws.ec2.block_device_mappings[].iops`: Provisioned IOPS for volume types that support it.
    - `aws.ec2.block_device_mappings[].kms_key_id`: KMS key ID or ARN used to encrypt the volume.
    - `aws.ec2.block_device_mappings[].snapshot_id`: Snapshot used to initialize the volume.
    - `aws.ec2.block_device_mappings[].throughput`: Provisioned throughput for volume types that support it.
    - `aws.ec2.block_device_mappings[].volume_initialization_rate`: Fixed initialization rate in MiB/s for supported snapshot-backed volumes.
    - `aws.ec2.block_device_mappings[].volume_size`: Volume size in GiB.
    - `aws.ec2.block_device_mappings[].volume_type`: EBS volume type.
    - `aws.ec2.ebs_optimized`: Requests EBS-optimized runner instances.
    - `aws.ec2.instance_target_capacity_type`: Primary capacity type, either `spot` or `on-demand`.
    - `aws.ec2.instance_allocation_strategy`: EC2 Fleet allocation strategy used to select instance capacity.
    - `aws.ec2.instance_type_priorities`: Optional numeric priorities keyed by instance type.
    - `aws.ec2.instance_max_spot_price`: Optional maximum hourly Spot price.
    - `aws.ec2.instance_types`: EC2 instance types available to the scale-up and pool functions.
    - `aws.ec2.user_data`: Runner bootstrap user-data configuration.
    - `aws.ec2.user_data.enabled`: Enables launch-template user data.
    - `aws.ec2.user_data.template`: Optional path to a custom user-data template.
    - `aws.ec2.user_data.content`: Optional complete user-data content. When set, it is used instead of rendering a template.
    - `aws.ec2.user_data.pre_install`: Script content inserted before runner installation in the default template.
    - `aws.ec2.user_data.post_install`: Script content inserted after runner installation in the default template.
    - `aws.ec2.user_data.debug_logging_enabled`: Enables verbose user-data tracing, which can expose secrets in logs.
    - `aws.ec2.ssm_enabled`: Attaches runner permissions and policies required for AWS Systems Manager access.
    - `aws.ec2.create_service_linked_role_spot`: Allows scale-up to create the EC2 Spot service-linked role.
    - `aws.ec2.cloudwatch_agent`: CloudWatch agent configuration for runner instances.
    - `aws.ec2.cloudwatch_agent.enabled`: Installs and configures the CloudWatch agent through the default bootstrap flow.
    - `aws.ec2.cloudwatch_agent.config`: Optional complete CloudWatch agent configuration. Null renders the provider default from `log_files`.
    - `aws.ec2.managed_security_group_enabled`: Creates and attaches the provider-managed runner security group.
    - `aws.ec2.log_files`: Optional log files collected by the CloudWatch agent. Null uses the provider defaults.
    - `aws.ec2.log_files[].log_group_name`: CloudWatch log-group name, before optional prefixing.
    - `aws.ec2.log_files[].prefix_log_group`: Prefixes the log-group name with the runner configuration path when true.
    - `aws.ec2.log_files[].file_path`: File or glob read by the CloudWatch agent.
    - `aws.ec2.log_files[].log_stream_name`: CloudWatch log-stream name template.
    - `aws.ec2.log_files[].log_class`: CloudWatch log-group class for the collected file.
    - `aws.ec2.key_name`: Optional EC2 key-pair name added to the launch template.
    - `aws.ec2.additional_security_group_ids`: Existing security groups attached in addition to the managed security group.
    - `aws.ec2.detailed_monitoring_enabled`: Enables detailed EC2 monitoring for runner instances.
    - `aws.ec2.egress_rules`: Egress rules created on the managed runner security group.
    - `aws.ec2.egress_rules[].cidr_blocks`: IPv4 CIDR destinations.
    - `aws.ec2.egress_rules[].ipv6_cidr_blocks`: IPv6 CIDR destinations.
    - `aws.ec2.egress_rules[].prefix_list_ids`: AWS prefix-list destinations.
    - `aws.ec2.egress_rules[].from_port`: First destination port in the permitted range.
    - `aws.ec2.egress_rules[].protocol`: IP protocol name or number. Use `-1` for all protocols.
    - `aws.ec2.egress_rules[].security_groups`: Destination security-group IDs.
    - `aws.ec2.egress_rules[].self`: Allows traffic to the managed security group itself when true.
    - `aws.ec2.egress_rules[].to_port`: Last destination port in the permitted range.
    - `aws.ec2.egress_rules[].description`: Optional rule description.
    - `aws.ec2.tags`: Additional tags for runner instances, EBS volumes, network interfaces, and eligible Spot instance requests created from the launch template. They override module-level tags and the generated runner `Name`; the provider-managed `ghr:environment`, `ghr:ssm_config_path`, and `ghr:runner_name_prefix` bootstrap tags take final precedence. These tags do not apply to static provider resources such as the launch template, security group, IAM resources, SSM parameters, or log groups.
    - `aws.ec2.metadata_options`: Instance Metadata Service configuration in the launch template.
    - `aws.ec2.metadata_options.instance_metadata_tags`: Exposes instance tags through Instance Metadata Service when `enabled`.
    - `aws.ec2.metadata_options.http_endpoint`: Enables or disables the Instance Metadata Service endpoint.
    - `aws.ec2.metadata_options.http_tokens`: Controls whether IMDSv2 session tokens are optional or required.
    - `aws.ec2.metadata_options.http_put_response_hop_limit`: Network hop limit for Instance Metadata Service token responses.
    - `aws.ec2.credit_specification`: CPU credit mode for burstable instance types, either `standard` or `unlimited`.
    - `aws.ec2.cpu_options`: CPU topology and processor-feature configuration.
    - `aws.ec2.cpu_options.core_count`: Number of CPU cores exposed to the runner instance.
    - `aws.ec2.cpu_options.threads_per_core`: Number of hardware threads exposed per CPU core.
    - `aws.ec2.cpu_options.amd_sev_snp`: Enables or disables AMD SEV-SNP on supported instance types.
    - `aws.ec2.cpu_options.nested_virtualization`: Enables or disables nested virtualization on supported instance types.
    - `aws.ec2.placement`: EC2 placement configuration for runner instances.
    - `aws.ec2.placement.affinity`: Host affinity setting.
    - `aws.ec2.placement.availability_zone`: Availability Zone in which the instance is placed.
    - `aws.ec2.placement.group_id`: Placement-group ID.
    - `aws.ec2.placement.group_name`: Placement-group name.
    - `aws.ec2.placement.host_id`: Dedicated Host ID.
    - `aws.ec2.placement.host_resource_group_arn`: ARN of the host resource group used for placement.
    - `aws.ec2.placement.spread_domain`: Spread-domain placement value.
    - `aws.ec2.placement.tenancy`: Instance tenancy, such as `default`, `dedicated`, or `host`.
    - `aws.ec2.placement.partition_number`: Placement-group partition number.
    - `aws.ec2.license_specifications`: License Manager configurations added to the launch template.
    - `aws.ec2.license_specifications[].license_configuration_arn`: ARN of a License Manager license configuration.
    - `aws.ec2.associate_public_ipv4_address`: Associates a public IPv4 address with runner network interfaces.
    - `aws.ec2.enable_on_demand_failover_for_errors`: EC2 error codes that trigger an on-demand fallback after a Spot launch failure.
    - `aws.ec2.scale_errors`: EC2 error codes treated as retryable scale-up failures.
    - `aws.ec2.use_dedicated_host`: Enables the dedicated-host launch path, required for macOS runners.
    - `aws.microvm`: Lambda MicroVM compute-provider configuration. Selecting this provider requires a Linux ARM64 runner and ephemeral webhook orchestration with JIT configuration enabled; the resolved `runner.iam.role` is used as the MicroVM execution role.
    - `aws.microvm.image_arn`: ARN of the MicroVM image used to run GitHub runners.
    - `aws.microvm.image_version`: Optional MicroVM image version.
    - `aws.microvm.ingress_network_connectors`: Up to 10 Lambda network-connector ARNs passed to RunMicrovm.
    - `aws.microvm.egress_network_connectors`: Up to 10 Lambda network-connector ARNs passed to RunMicrovm.
    - `aws.microvm.maximum_duration_in_seconds`: Optional maximum MicroVM lifetime. Valid values are integers from 1 through 28,800 seconds.
    - `aws.microvm.environment_variables`: Additional provider-specific Lambda environment variables merged into scale-up, scale-down, and pool.
    - `aws.microvm.iam.resource_arns.images`: MicroVM image ARNs allowed by RunMicrovm.
    - `aws.microvm.iam.resource_arns.microvms`: MicroVM instance ARNs allowed by tagging and termination actions.
    - `aws.microvm.iam.additional_policy_json.scale_up`: Optional additional provider policy attached separately to the scale-up Lambda role.
    - `aws.microvm.iam.managed_policies.scale_up`: Optional plan-known managed-policy wrapper attached to the scale-up Lambda role.
    - `aws.microvm.iam.managed_policies.scale_up.arn`: Managed-policy ARN; it may remain unknown until apply.
    - `aws.microvm.iam.managed_policies.pool`: Optional plan-known managed-policy wrapper attached to the pool Lambda role.
    - `aws.microvm.iam.managed_policies.pool.arn`: Managed-policy ARN; it may remain unknown until apply.
  EOT

  type = object({
    aws = optional(object({
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
        image_arn                   = string
        image_version               = optional(string, null)
        ingress_network_connectors  = optional(list(string), [])
        egress_network_connectors   = optional(list(string), [])
        maximum_duration_in_seconds = optional(number, null)
        environment_variables       = optional(map(string), {})
        iam = optional(object({
          resource_arns = optional(object({
            images   = optional(list(string), ["*"])
            microvms = optional(list(string), ["*"])
          }), {})
          additional_policy_json = optional(object({
            scale_up = optional(string, null)
          }), {})
          managed_policies = optional(object({
            scale_up = optional(object({
              arn = string
            }), null)
            pool = optional(object({
              arn = string
            }), null)
          }), {})
        }), {})
      }), null)
    }), {})
  })

}
