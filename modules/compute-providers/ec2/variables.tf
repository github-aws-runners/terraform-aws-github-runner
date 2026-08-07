variable "ami" {
  description = <<-EOT
    AMI selection and encryption configuration for runner instances. Null selects the default AMI configuration for `runner_os`.

    - `filter`: AMI filter names mapped to accepted values. These values are merged over the default filter for `runner_os`.
    - `owners`: AWS account IDs or aliases allowed to own the selected AMI.
    - `id_ssm_parameter`: Optional externally managed SSM parameter containing the AMI ID. Null creates a provider-managed AMI-ID parameter from the selected AMI. The wrapper's presence is the plan-time ownership discriminator, so keep the object literal even when its ARN comes from another resource.
    - `id_ssm_parameter.arn`: ARN of the externally managed SSM parameter. The ARN may be unknown until apply.
    - `kms_key`: Optional customer-managed KMS key required to launch an encrypted AMI or snapshot. The wrapper's presence is the plan-time policy discriminator.
    - `kms_key.arn`: ARN of the customer-managed KMS key. The ARN may be unknown until apply.
  EOT
  type = object({
    filter = optional(map(list(string)), { state = ["available"] })
    owners = optional(list(string), ["amazon"])
    id_ssm_parameter = optional(object({
      arn = string
    }), null)
    kms_key = optional(object({
      arn = string
    }), null)
  })
  default = null
}

variable "vpc_id" {
  description = "The VPC for the security groups."
  type        = string
}

variable "subnet_ids" {
  description = "List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`."
  type        = list(string)
}

variable "overrides" {
  description = <<-EOT
    Optional resource-name overrides.

    - `name_runner`: Name tag assigned to runner compute resources. An empty value uses the generated provider name.
    - `name_sg`: Name tag assigned to the managed runner security group. An empty value uses the generated provider name.
  EOT
  type = object({
    name_runner = optional(string, "")
    name_sg     = optional(string, "")
  })

  default = {}
}

variable "iam_overrides" {
  description = <<-EOT
    EC2 instance-profile ownership and selection.

    - `override_instance_profile`: Uses an externally managed instance profile when true; otherwise this module creates an instance profile for `runner_role`.
    - `instance_profile_name`: Name of the externally managed instance profile used by the launch template. Required when `override_instance_profile` is true.
  EOT
  type = object({
    override_instance_profile = optional(bool, false)
    instance_profile_name     = optional(string, null)
  })

  default = {
    override_instance_profile = false
    instance_profile_name     = null
  }

  validation {
    condition     = !var.iam_overrides.override_instance_profile || var.iam_overrides.instance_profile_name != null
    error_message = "instance_profile_name must be provided when override_instance_profile is true."
  }
}

variable "runner_role" {
  description = <<-EOT
    Runner IAM role created or selected by the common runner stack.

    - `arn`: Role ARN referenced by the EC2 control-plane policies.
    - `name`: Role name associated with the provider-managed EC2 instance profile.
  EOT
  type = object({
    arn  = string
    name = string
  })
}

variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name."
  type        = map(string)
  default     = {}
}

variable "ssm_parameter_tags" {
  description = "Map of tags that will be added to SSM parameters created by the EC2 provider. These tags override provider tags with the same key."
  type        = map(string)
  default     = {}
}

variable "log_group_tags" {
  description = "Map of tags that will be added to CloudWatch log groups created by the EC2 provider. These tags override provider tags with the same key."
  type        = map(string)
  default     = {}
}

variable "prefix" {
  description = "The prefix used for naming resources"
  type        = string
  default     = "github-actions"
}

variable "s3_runner_binaries" {
  description = <<-EOT
    S3 location of the synchronized GitHub runner distribution.

    - `arn`: Bucket ARN referenced by the runner IAM policy.
    - `id`: Bucket name used to construct the runner-distribution S3 URI.
    - `key`: Object key of the synchronized runner distribution.
  EOT
  type = object({
    arn = string
    id  = string
    key = string
  })
}

variable "block_device_mappings" {
  description = <<-EOT
    EBS block-device mappings added to the runner launch template.

    - `delete_on_termination`: Deletes the EBS volume when its runner instance terminates.
    - `device_name`: Device name exposed to the runner instance.
    - `encrypted`: Enables encryption for the EBS volume.
    - `iops`: Provisioned IOPS for volume types that support configurable IOPS.
    - `kms_key_id`: KMS key ID or ARN used to encrypt the EBS volume.
    - `snapshot_id`: Snapshot used to initialize the EBS volume.
    - `throughput`: Provisioned throughput in MiB/s for volume types that support configurable throughput.
    - `volume_initialization_rate`: Fixed volume initialization rate in MiB/s for supported snapshot-backed volumes.
    - `volume_size`: EBS volume size in GiB.
    - `volume_type`: EBS volume type.
  EOT
  type = list(object({
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
  }))
  default = [{
    volume_size = 30
  }]
}

variable "ebs_optimized" {
  description = "The EC2 EBS optimized configuration."
  type        = bool
  default     = false
}

variable "instance_target_capacity_type" {
  description = "Default lifecycle used runner instances, can be either `spot` or `on-demand`."
  type        = string
  default     = "spot"

  validation {
    condition     = contains(["spot", "on-demand"], var.instance_target_capacity_type)
    error_message = "The instance target capacity should be either spot or on-demand."
  }
}

variable "instance_allocation_strategy" {
  description = "The allocation strategy for creating instances. For spot, AWS recommends `price-capacity-optimized`; for on-demand, use `lowest-price` or `prioritized`. The AWS default is `lowest-price`."
  type        = string
  default     = "lowest-price"

  validation {
    condition     = contains(["lowest-price", "diversified", "capacity-optimized", "capacity-optimized-prioritized", "price-capacity-optimized", "prioritized"], var.instance_allocation_strategy)
    error_message = "The instance allocation strategy does not match the allowed values."
  }
}

variable "instance_type_priorities" {
  description = "A map of instance type to priority for the `prioritized` and `capacity-optimized-prioritized` allocation strategies. Lower numbers mean higher priority. If not provided, priorities are assigned based on the order of `instance_types`."
  type        = map(number)
  default     = null
}

variable "instance_max_spot_price" {
  description = "Max price price for spot instances per hour. This variable will be passed to the create fleet as max spot price for the fleet."
  type        = string
  default     = null
}

variable "runner_os" {
  description = "The EC2 Operating System type to use for action runner instances (linux, osx, windows)."
  type        = string
  default     = "linux"

  validation {
    condition     = contains(["linux", "osx", "windows"], var.runner_os)
    error_message = "Valid values for runner_os are (linux, osx, windows)."
  }
}

variable "instance_types" {
  description = "List of EC2 instance types available when launching runner capacity."
  type        = list(string)
  default     = null
}


variable "enable_userdata" {
  description = "Should the userdata script be enabled for the runner. Set this to false if you are using your own prebuilt AMI"
  type        = bool
  default     = true
}

variable "userdata_template" {
  description = "Alternative user-data template file path replacing the default template. The template receives the standard bootstrap values, including `pre_install` and `post_install`; a custom template decides how to use them and must install the required runner software."
  type        = string
  default     = null
}

variable "userdata_content" {
  description = "Alternative user-data content, replacing the templated one. By providing your own user_data you have to take care of installing all required software, including the action runner and registering the runner.  Be-aware configuration parameters in SSM as well as tags are treated as internals. Changes will not trigger a breaking release."
  type        = string
  default     = null
}

variable "userdata_pre_install" {
  description = "User-data script snippet to insert before GitHub action runner install"
  type        = string
  default     = ""
}

variable "userdata_post_install" {
  description = "User-data script snippet to insert after GitHub action runner install"
  type        = string
  default     = ""
}

variable "runner_hook_job_started" {
  description = "Script to be ran in the runner environment at the beginning of every job"
  type        = string
  default     = ""
}

variable "runner_hook_job_completed" {
  description = "Script to be ran in the runner environment at the end of every job"
  type        = string
  default     = ""
}

variable "runner_boot_time_in_minutes" {
  description = "The minimum time for an EC2 runner to boot and register as a runner."
  type        = number
  default     = 5
}

variable "role_path" {
  description = "The path that will be added to the role; if not set, the prefix will be used."
  type        = string
  default     = null
}

variable "instance_profile_path" {
  description = "The path that will be added to the instance_profile, if not set the prefix will be used."
  type        = string
  default     = null
}

variable "runner_as_root" {
  description = "Run the action runner under the root user. Variable `runner_run_as` will be ignored."
  type        = bool
  default     = false
}

variable "runner_run_as" {
  description = "Run the GitHub actions agent as user."
  type        = string
  default     = "ec2-user"
}

variable "runner_architecture" {
  description = "The platform architecture of the runner instance_type."
  type        = string
  default     = "x64"
}

variable "logging_retention_in_days" {
  description = "Number of days to retain events in the EC2 runner log groups. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653."
  type        = number
  default     = 180
}

variable "logging_kms_key_id" {
  description = "Specifies the kms key id to encrypt the logs with"
  type        = string
  default     = null
}

variable "create_service_linked_role_spot" {
  description = "(optional) create the service linked role for spot instances that is required by the scale-up lambda."
  type        = bool
  default     = false
}

variable "aws_partition" {
  description = "(optional) partition for the base arn if not 'aws'"
  type        = string
  default     = "aws"
}

variable "enable_cloudwatch_agent" {
  description = "Enabling the cloudwatch agent on the ec2 runner instances, the runner contains default config. Configuration can be overridden via `cloudwatch_config`."
  type        = bool
  default     = true
}

variable "enable_managed_runner_security_group" {
  description = "Enabling the default managed security group creation. Unmanaged security groups can be specified via `runner_additional_security_group_ids`."
  type        = bool
  default     = true
}

variable "cloudwatch_config" {
  description = "(optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details."
  type        = string
  default     = null
}

variable "runner_log_files" {
  description = "(optional) List of logfiles to send to CloudWatch, will only be used if `enable_cloudwatch_agent` is set to true. Object description: `log_group_name`: Name of the log group, `prefix_log_group`: If true, the log group name will be prefixed with `/github-self-hosted-runners/<var.prefix>`, `file_path`: path to the log file, `log_stream_name`: name of the log stream, `log_class`: The log class of the log group. Valid values are `STANDARD` or `INFREQUENT_ACCESS`. Defaults to `STANDARD`."
  type = list(object({
    log_group_name   = string
    prefix_log_group = bool
    file_path        = string
    log_stream_name  = string
    log_class        = optional(string, "STANDARD")
  }))
  default = null
}

variable "ghes_url" {
  description = "GitHub Enterprise Server URL. DO NOT SET IF USING PUBLIC GITHUB..However if you are using GitHub Enterprise Cloud with data-residency (ghe.com), set the endpoint here. Example - https://companyname.ghe.com|"
  type        = string
  default     = null
}

variable "ghes_ssl_verify" {
  description = "GitHub Enterprise SSL verification. Set to 'false' when custom certificate (chains) is used for GitHub Enterprise Server (insecure)."
  type        = bool
  default     = true
}

variable "key_name" {
  description = "Key pair name"
  type        = string
  default     = null
}

variable "runner_additional_security_group_ids" {
  description = "(optional) List of additional security groups IDs to apply to the runner"
  type        = list(string)
  default     = []
}

variable "enable_runner_detailed_monitoring" {
  description = "Enable detailed monitoring for runners"
  type        = bool
  default     = false
}

variable "egress_rules" {
  description = <<-EOT
    Egress rules created on the provider-managed runner security group.

    - `cidr_blocks`: IPv4 CIDR destinations allowed by the rule.
    - `ipv6_cidr_blocks`: IPv6 CIDR destinations allowed by the rule.
    - `prefix_list_ids`: AWS prefix-list destinations allowed by the rule.
    - `from_port`: First destination port in the permitted range.
    - `protocol`: IP protocol name or number. Use `-1` for all protocols.
    - `security_groups`: Destination security-group IDs allowed by the rule.
    - `self`: Allows traffic to the managed runner security group itself when true.
    - `to_port`: Last destination port in the permitted range.
    - `description`: Optional description assigned to the security-group rule.
  EOT
  type = list(object({
    cidr_blocks      = list(string)
    ipv6_cidr_blocks = list(string)
    prefix_list_ids  = list(string)
    from_port        = number
    protocol         = string
    security_groups  = list(string)
    self             = bool
    to_port          = number
    description      = string
  }))
  default = [{
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
    prefix_list_ids  = null
    from_port        = 0
    protocol         = "-1"
    security_groups  = null
    self             = null
    to_port          = 0
    description      = null
  }]
}

variable "runner_ec2_tags" {
  description = "Tags added to runner instance, volume, network-interface, and eligible Spot-request tag specifications. These override module tags and the generated runner `Name`; provider-required `ghr:environment`, `ghr:ssm_config_path`, and `ghr:runner_name_prefix` tags take final precedence."
  type        = map(string)
  default     = {}
}

variable "metadata_options" {
  description = <<-EOT
    Instance Metadata Service configuration in the runner launch template. The default bootstrap flow reads runner configuration from instance tags, so disable metadata tags only when supplying a custom startup flow.

    - `instance_metadata_tags`: Exposes instance tags through Instance Metadata Service when set to `enabled`.
    - `http_endpoint`: Enables or disables the Instance Metadata Service endpoint.
    - `http_tokens`: Controls whether IMDSv2 session tokens are optional or required.
    - `http_put_response_hop_limit`: Network hop limit for Instance Metadata Service token responses.
  EOT
  type = object({
    instance_metadata_tags      = optional(string, "enabled")
    http_endpoint               = optional(string, "enabled")
    http_tokens                 = optional(string, "required")
    http_put_response_hop_limit = optional(number, 1)
  })
  default = {}
}

variable "enable_runner_binaries_syncer" {
  description = "Uses a synchronized GitHub runner distribution from `s3_runner_binaries` during bootstrap. Disable this when the runner distribution is already present in a prebuilt AMI. This module does not create the synchronization Lambda."
  type        = bool
  default     = true
}

variable "enable_user_data_debug_logging" {
  description = "Option to enable debug logging for user-data, this logs all secrets as well."
  type        = bool
  default     = false
}

variable "ssm_paths" {
  description = <<-EOT
    Parameter Store paths used by the EC2 provider and runner bootstrap flow.

    - `root`: Root Parameter Store path for this runner stack.
    - `tokens`: Path segment under `root` used for registration tokens and just-in-time configuration.
    - `config`: Path segment under `root` used for persistent runner and provider configuration.
  EOT
  type = object({
    root   = string
    tokens = string
    config = string
  })
}

variable "runner_name_prefix" {
  description = "The prefix used for the GitHub runner name. The prefix will be used in the default start script to prefix the instance name when register the runner in GitHub. The value is available via an EC2 tag 'ghr:runner_name_prefix'."
  type        = string
  default     = ""
  validation {
    condition     = length(var.runner_name_prefix) <= 45
    error_message = "The prefix used for the GitHub runner name must be less than 32 characters. AWS instances id are 17 chars, https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/resource-ids.html"
  }
}

variable "credit_specification" {
  description = "The credit option for CPU usage of a T instance. Can be unset, \"standard\" or \"unlimited\"."
  type        = string
  default     = null

  validation {
    condition     = var.credit_specification == null ? true : contains(["standard", "unlimited"], var.credit_specification)
    error_message = "Valid values for credit_specification are (null, \"standard\", \"unlimited\")."
  }
}

variable "cpu_options" {
  description = <<-EOT
    CPU topology and processor-feature configuration for runner instances. Not all instance types support these options.

    - `core_count`: Number of CPU cores exposed to the runner instance.
    - `threads_per_core`: Number of hardware threads exposed per CPU core.
    - `amd_sev_snp`: Enables or disables AMD SEV-SNP on supported instance types.
    - `nested_virtualization`: Enables or disables nested virtualization on supported instance types.
  EOT
  type = object({
    core_count            = optional(number)
    threads_per_core      = optional(number)
    amd_sev_snp           = optional(string)
    nested_virtualization = optional(string)
  })
  default = null

  validation {
    condition = var.cpu_options == null ? true : (
      (var.cpu_options.amd_sev_snp == null || contains(["enabled", "disabled"], var.cpu_options.amd_sev_snp)) &&
      (var.cpu_options.nested_virtualization == null || contains(["enabled", "disabled"], var.cpu_options.nested_virtualization))
    )
    error_message = "When set, cpu_options.amd_sev_snp and cpu_options.nested_virtualization must be one of: enabled, disabled."
  }
}

variable "placement" {
  description = <<-EOT
    EC2 placement configuration for runner instances.

    - `affinity`: Dedicated Host affinity setting.
    - `availability_zone`: Availability Zone in which runner instances are placed.
    - `group_id`: Placement-group ID.
    - `group_name`: Placement-group name.
    - `host_id`: Dedicated Host ID.
    - `host_resource_group_arn`: ARN of the host resource group used for placement.
    - `spread_domain`: Spread-domain placement value.
    - `tenancy`: Instance tenancy, such as `default`, `dedicated`, or `host`.
    - `partition_number`: Placement-group partition number.
  EOT
  type = object({
    affinity                = optional(string)
    availability_zone       = optional(string)
    group_id                = optional(string)
    group_name              = optional(string)
    host_id                 = optional(string)
    host_resource_group_arn = optional(string)
    spread_domain           = optional(string)
    tenancy                 = optional(string)
    partition_number        = optional(number)
  })
  default = null
}

variable "license_specifications" {
  description = <<-EOT
    License Manager configurations added to the runner launch template. These may be required for macOS dedicated-host runners when the host resource group uses a Mac dedicated-host license configuration.

    - `license_configuration_arn`: ARN of an AWS License Manager license configuration.
  EOT
  type = list(object({
    license_configuration_arn = string
  }))
  default = []
}

variable "associate_public_ipv4_address" {
  description = "Associate public IPv4 with the runner. Only tested with IPv4"
  type        = bool
  default     = false
}

variable "enable_on_demand_failover_for_errors" {
  description = "Enable on-demand failover. For example to fall back to on demand when no spot capacity is available the variable can be set to `InsufficientInstanceCapacity`. When not defined the default behavior is to retry later."
  type        = list(string)
  default     = []
}

variable "scale_errors" {
  description = "List of AWS error codes that should trigger retry during scale up. This list replaces the module default scale-up retry errors"
  type        = list(string)
  default = [
    "UnfulfillableCapacity",
    "MaxSpotInstanceCountExceeded",
    "TargetCapacityLimitExceededException",
    "RequestLimitExceeded",
    "ResourceLimitExceeded",
    "MaxSpotInstanceCountExceeded",
    "MaxSpotFleetRequestCountExceeded",
    "InsufficientInstanceCapacity",
    "InsufficientCapacityOnHost",
  ]
}

variable "use_dedicated_host" {
  description = "Experimental! Can be removed / changed without trigger a major release. Whether to use EC2 dedicated hosts for the runners. Needed for macos runners Note that using dedicated hosts can increase cost significantly."
  type        = bool
  default     = false
}
