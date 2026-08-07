variable "ami" {
  description = <<EOT
AMI configuration for the action runner instances. This object allows you to specify all AMI-related settings in one place.

Parameters:
- `filter`: Map of lists to filter AMIs by various criteria (e.g., { name = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-*"], state = ["available"] })
- `owners`: List of AMI owners to limit the search. Common values: ["amazon"], ["self"], or specific AWS account IDs
- `id_ssm_parameter_name`: Name of an SSM parameter containing the AMI ID. If specified, this overrides the AMI filter
- `id_ssm_parameter_arn`: ARN of an SSM parameter containing the AMI ID. If specified, this overrides both AMI filter and parameter name
- `kms_key_arn`: Optional KMS key ARN if the AMI is encrypted with a customer managed key

Defaults to null, in which case the module falls back to individual AMI variables (deprecated).
EOT
  type = object({
    filter               = optional(map(list(string)), { state = ["available"] })
    owners               = optional(list(string), ["amazon"])
    id_ssm_parameter_arn = optional(string, null)
    kms_key_arn          = optional(string, null)
  })
  default = null
}

variable "aws_region" {
  description = "AWS region."
  type        = string
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
  description = "This map provides the possibility to override some defaults. The following attributes are supported: `name_sg` overrides the `Name` tag for all security groups created by this module. `name_runner_agent_instance` overrides the `Name` tag for the ec2 instance defined in the auto launch configuration. `name_docker_machine_runners` overrides the `Name` tag spot instances created by the runner agent."
  type = object({
    name_runner = optional(string, "")
    name_sg     = optional(string, "")
  })

  default = {}
}

variable "iam_overrides" {
  description = "Overrides for the EC2 instance profile used by the launch template."
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
  description = "Runner IAM role created or selected by the common runner stack."
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

variable "prefix" {
  description = "The prefix used for naming resources"
  type        = string
  default     = "github-actions"
}

variable "s3_runner_binaries" {
  description = "Bucket details for cached GitHub binary."
  type = object({
    arn = string
    id  = string
    key = string
  })
}

variable "block_device_mappings" {
  description = "The EC2 instance block device configuration. Takes the following keys: `device_name`, `delete_on_termination`, `volume_type`, `volume_size`, `encrypted`, `iops`, `throughput`, `kms_key_id`, `snapshot_id`, `volume_initialization_rate`."
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
  description = "List of instance types for the action runner. Defaults are based on runner_os (al2023 for linux, macOS Sequoia for osx, Windows Server Core for win)."
  type        = list(string)
  default     = null
}


variable "enable_userdata" {
  description = "Should the userdata script be enabled for the runner. Set this to false if you are using your own prebuilt AMI"
  type        = bool
  default     = true
}

variable "userdata_template" {
  description = "Alternative user-data template file path, replacing the default template. By providing your own user_data you have to take care of installing all required software, including the action runner. Variables userdata_pre/post_install are ignored."
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
  description = "Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653."
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
  description = "List of egress rules for the GitHub runner instances."
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
  description = "Map of tags that will be added to the launch template instance tag specifications."
  type        = map(string)
  default     = {}
}

variable "metadata_options" {
  description = "Metadata options for the ec2 runner instances. By default, the module uses metadata tags for bootstrapping the runner, only disable `instance_metadata_tags` when using custom scripts for starting the runner."
  type = object({
    instance_metadata_tags      = optional(string, "enabled")
    http_endpoint               = optional(string, "enabled")
    http_tokens                 = optional(string, "required")
    http_put_response_hop_limit = optional(number, 1)
  })
  default = {}
}

variable "enable_runner_binaries_syncer" {
  description = "Option to disable the lambda to sync GitHub runner distribution, useful when using a pre-build AMI."
  type        = bool
  default     = true
}

variable "enable_user_data_debug_logging" {
  description = "Option to enable debug logging for user-data, this logs all secrets as well."
  type        = bool
  default     = false
}

variable "ssm_paths" {
  description = "The root path used in SSM to store configuration and secrets."
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
  description = "The CPU options for the instance. See https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/launch_template#cpu-options for details. Note that not all instance types support CPU options, see https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-optimize-cpu.html#instance-cpu-options"
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
  description = "The placement options for the instance. See https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/launch_template#placement for details."
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
  description = "Optional EC2 License Manager license configuration ARNs for the runner launch template. Required for macOS dedicated-host runners when the host resource group uses a Mac dedicated host license configuration. See https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/launch_template#license_specification for details."
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
