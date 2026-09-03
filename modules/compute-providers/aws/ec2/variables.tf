variable "aws_partition" {
  description = "AWS partition used to construct IAM ARNs."
  type        = string
  default     = "aws"
}

variable "aws_region" {
  description = "AWS region used by compute-provider resources and policy documents."
  type        = string
}

variable "prefix" {
  description = "Prefix used to identify resources created for the runner configuration."
  type        = string
  default     = "github-actions"
}

variable "tags" {
  description = "Base tags available to taggable compute-provider resources. Provider-specific tags override this map within their documented scopes."
  type        = map(string)
  default     = {}
}

variable "config" {
  description = <<-EOT
    EC2 compute-provider configuration. Paths match `compute_provider.aws.ec2` in the runner configuration.

    - `ami`: Optional AMI discovery and encryption configuration. Null selects defaults for `runner.os` and `runner.architecture`.
    - `ami.filter`: AMI filter names mapped to accepted values and merged over the provider defaults.
    - `ami.owners`: AWS account IDs or aliases allowed to own the selected AMI.
    - `ami.id_ssm_parameter`: Optional externally managed SSM parameter containing the AMI ID. Its object presence is the plan-time ownership discriminator.
    - `ami.id_ssm_parameter.arn`: ARN of the external AMI-ID parameter. The ARN may remain unknown until apply.
    - `ami.kms_key`: Optional customer-managed KMS key required for encrypted AMIs or snapshots. Its object presence is the plan-time policy discriminator.
    - `ami.kms_key.arn`: ARN of the AMI KMS key. The ARN may remain unknown until apply.
    - `vpc_id`: VPC in which runner networking resources are created.
    - `subnet_ids`: Subnets from which the control plane may launch runners.
    - `overrides.name_runner`: Optional Name tag override for runner compute resources.
    - `overrides.name_sg`: Optional Name tag override for the managed security group.
    - `instance_profile`: Optional externally managed instance profile. Its object presence is the plan-time ownership discriminator.
    - `instance_profile.name`: Name of the external instance profile. The name may remain unknown until apply.
    - `instance_profile_path`: IAM path for the provider-managed instance profile. Null derives the path from `prefix`.
    - `binaries_syncer.enabled`: Uses the synchronized runner distribution from S3 during bootstrap.
    - `binaries_syncer.s3`: S3 object containing the synchronized runner distribution. Required when synchronization is enabled.
    - `binaries_syncer.s3.arn`: Runner-distribution bucket ARN used by IAM policies.
    - `binaries_syncer.s3.id`: Runner-distribution bucket name used in the bootstrap URI.
    - `binaries_syncer.s3.key`: Runner-distribution object key.
    - `block_device_mappings`: EBS mappings added to the launch template.
    - `block_device_mappings[].delete_on_termination`: Deletes the volume when its runner terminates.
    - `block_device_mappings[].device_name`: Device name exposed to the runner instance.
    - `block_device_mappings[].encrypted`: Enables EBS encryption.
    - `block_device_mappings[].iops`: Provisioned IOPS for volume types that support configurable IOPS.
    - `block_device_mappings[].kms_key_id`: KMS key ID or ARN used to encrypt the volume.
    - `block_device_mappings[].snapshot_id`: Snapshot used to initialize the volume.
    - `block_device_mappings[].throughput`: Provisioned throughput for volume types that support it.
    - `block_device_mappings[].volume_initialization_rate`: Fixed initialization rate for supported snapshot-backed volumes.
    - `block_device_mappings[].volume_size`: EBS volume size in GiB.
    - `block_device_mappings[].volume_type`: EBS volume type.
    - `ebs_optimized`: Requests EBS-optimized instances.
    - `instance_target_capacity_type`: Primary capacity type, either `spot` or `on-demand`.
    - `instance_allocation_strategy`: EC2 Fleet allocation strategy.
    - `instance_type_priorities`: Optional numeric priorities keyed by instance type.
    - `instance_max_spot_price`: Optional maximum hourly Spot price.
    - `instance_types`: EC2 instance types available to the control plane.
    - `user_data`: Runner bootstrap user-data configuration.
    - `user_data.enabled`: Enables launch-template user data.
    - `user_data.template`: Optional path to a custom user-data template.
    - `user_data.content`: Optional complete user-data content used instead of a template.
    - `user_data.pre_install`: Script inserted before runner installation.
    - `user_data.post_install`: Script inserted after runner installation.
    - `user_data.debug_logging_enabled`: Enables verbose user-data tracing, which can expose secrets.
    - `ssm_enabled`: Includes Session Manager permissions in the provider's runner policy group.
    - `create_service_linked_role_spot`: Allows scale-up to create the EC2 Spot service-linked role.
    - `cloudwatch_agent.enabled`: Enables CloudWatch agent configuration for runner instances.
    - `cloudwatch_agent.config`: Optional complete CloudWatch agent configuration.
    - `managed_security_group_enabled`: Creates and attaches the provider-managed security group.
    - `log_files`: Optional files collected by the CloudWatch agent. Null uses provider defaults.
    - `log_files[].log_group_name`: CloudWatch log-group name before optional prefixing.
    - `log_files[].prefix_log_group`: Prefixes the log-group name with the runner configuration path.
    - `log_files[].file_path`: File or glob read by the CloudWatch agent.
    - `log_files[].log_stream_name`: CloudWatch log-stream name template.
    - `log_files[].log_class`: CloudWatch log-group class for the collected file.
    - `key_name`: Optional EC2 key-pair name.
    - `additional_security_group_ids`: Existing security groups attached to runners.
    - `detailed_monitoring_enabled`: Enables detailed EC2 monitoring.
    - `egress_rules`: Rules created on the managed security group.
    - `egress_rules[].cidr_blocks`: IPv4 CIDR destinations.
    - `egress_rules[].ipv6_cidr_blocks`: IPv6 CIDR destinations.
    - `egress_rules[].prefix_list_ids`: AWS prefix-list destinations.
    - `egress_rules[].from_port`: First destination port in the permitted range.
    - `egress_rules[].protocol`: IP protocol name or number. Use `-1` for all protocols.
    - `egress_rules[].security_groups`: Destination security-group IDs.
    - `egress_rules[].self`: Allows traffic to the managed security group itself.
    - `egress_rules[].to_port`: Last destination port in the permitted range.
    - `egress_rules[].description`: Optional rule description.
    - `tags`: Runner instance, volume, network-interface, and eligible Spot-request tags. Provider-required bootstrap tags take final precedence.
    - `metadata_options`: Instance Metadata Service configuration.
    - `metadata_options.instance_metadata_tags`: Exposes instance tags through Instance Metadata Service when enabled.
    - `metadata_options.http_endpoint`: Enables or disables the Instance Metadata Service endpoint.
    - `metadata_options.http_tokens`: Controls whether IMDSv2 session tokens are optional or required.
    - `metadata_options.http_put_response_hop_limit`: Network hop limit for Instance Metadata Service token responses.
    - `credit_specification`: CPU credit mode for burstable instance types.
    - `cpu_options`: CPU topology and processor-feature configuration.
    - `cpu_options.core_count`: Number of CPU cores exposed to the runner instance.
    - `cpu_options.threads_per_core`: Number of hardware threads exposed per CPU core.
    - `cpu_options.amd_sev_snp`: Enables or disables AMD SEV-SNP on supported instance types.
    - `cpu_options.nested_virtualization`: Enables or disables nested virtualization on supported instance types.
    - `placement`: EC2 placement configuration.
    - `placement.affinity`: Dedicated Host affinity setting.
    - `placement.availability_zone`: Availability Zone in which runner instances are placed.
    - `placement.group_id`: Placement-group ID.
    - `placement.group_name`: Placement-group name.
    - `placement.host_id`: Dedicated Host ID.
    - `placement.host_resource_group_arn`: ARN of the host resource group used for placement.
    - `placement.spread_domain`: Spread-domain placement value.
    - `placement.tenancy`: Instance tenancy, such as `default`, `dedicated`, or `host`.
    - `placement.partition_number`: Placement-group partition number.
    - `license_specifications`: License Manager configurations added to the launch template.
    - `license_specifications[].license_configuration_arn`: ARN of an AWS License Manager license configuration.
    - `associate_public_ipv4_address`: Associates a public IPv4 address with runner network interfaces.
    - `enable_on_demand_failover_for_errors`: EC2 errors that trigger on-demand fallback after a Spot failure.
    - `scale_errors`: EC2 errors treated as retryable scale-up failures.
    - `use_dedicated_host`: Enables the dedicated-host launch path.
  EOT

  type = object({
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
  })

  nullable = false
}

variable "runner" {
  description = <<-EOT
    Provider-neutral runner settings consumed by compute providers.

    - `os`: Runner operating system. Supported values are `linux`, `osx`, and `windows`.
    - `architecture`: Runner distribution architecture.
    - `name_prefix`: Prefix added to registered runner names.
    - `run_as_root`: Runs the runner service as root.
    - `run_as`: Operating-system user used when `run_as_root` is false.
    - `hooks.job_started`: Script installed as the runner job-started hook.
    - `hooks.job_completed`: Script installed as the runner job-completed hook.
    - `iam.role.arn`: Resolved runner-role ARN referenced by provider policies and resources.
    - `iam.role.name`: Resolved runner-role name used by provider resources.
    - `iam.role.managed`: Whether runner-config manages the resolved runner role.
    - `iam.managed_policy_arns`: Common managed-policy ARNs returned with the provider-specific runner policies for attachment by runner-config.
    - `iam.path`: IAM path available to provider-managed IAM resources. Null derives the path from `prefix`.
  EOT
  type = object({
    os           = optional(string, "linux")
    architecture = optional(string, "x64")
    name_prefix  = optional(string, "")
    run_as_root  = optional(bool, false)
    run_as       = optional(string, "ec2-user")
    hooks = optional(object({
      job_started   = optional(string, "")
      job_completed = optional(string, "")
    }), {})
    iam = object({
      role = object({
        arn     = string
        name    = string
        managed = optional(bool, true)
      })
      managed_policy_arns = optional(map(string), {})
      path                = optional(string, null)
    })
  })

  nullable = false
}

variable "github" {
  description = <<-EOT
    GitHub Enterprise Server settings available to compute-provider bootstrap data.

    - `enterprise_server.url`: Optional GitHub Enterprise Server base URL. Null selects GitHub.com.
    - `enterprise_server.ssl_verify`: Enables TLS certificate verification for GitHub Enterprise Server.
  EOT
  type = object({
    enterprise_server = optional(object({
      url        = optional(string, null)
      ssl_verify = optional(bool, true)
    }), {})
  })
  default  = {}
  nullable = false
}

variable "ssm" {
  description = <<-EOT
    Parameter Store paths and tag scopes available to compute-provider bootstrap resources.

    - `paths.root`: Root Parameter Store path for the runner configuration.
    - `paths.tokens`: Path segment used for registration tokens and just-in-time configuration.
    - `paths.config`: Path segment used for persistent runner and provider configuration.
    - `tags`: Shared SSM tags that override module-level `tags`.
    - `parameters.tags`: Parameter-specific tags that override module-level and shared SSM tags.
  EOT
  type = object({
    paths = object({
      root   = string
      tokens = string
      config = string
    })
    tags = optional(map(string), {})
    parameters = optional(object({
      tags = optional(map(string), {})
    }), {})
  })

  nullable = false
}

variable "observability" {
  description = <<-EOT
    CloudWatch Logs settings available to compute-provider runner log groups.

    - `logs.retention_in_days`: Retention period for provider-owned runner log groups.
    - `logs.kms_key_id`: Optional KMS key ID or ARN used to encrypt runner log groups.
    - `logs.tags`: Shared log-group tags that override module-level `tags`.
  EOT
  type = object({
    logs = optional(object({
      retention_in_days = optional(number, 180)
      kms_key_id        = optional(string, null)
      tags              = optional(map(string), {})
    }), {})
  })
  default  = {}
  nullable = false
}
