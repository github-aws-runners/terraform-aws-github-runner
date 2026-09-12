# AMI selection, bootstrap rendering, launch template, and security group for
# EC2 runner instances.
locals {
  provider_tags = merge(
    {
      "Name" = format("%s-action-runner", var.prefix)
    },
    var.tags,
  )

  ssm_parameter_tags = merge(
    local.provider_tags,
    var.ssm.tags,
    var.ssm.parameters.tags,
  )

  log_group_tags = merge(
    local.provider_tags,
    var.observability.logs.tags,
  )

  name_sg     = var.config.overrides.name_sg == "" ? local.provider_tags["Name"] : var.config.overrides.name_sg
  name_runner = var.config.overrides.name_runner == "" ? local.provider_tags["Name"] : var.config.overrides.name_runner
  runner_tags = merge(
    local.provider_tags,
    {
      "Name" = local.name_runner
    },
    var.config.tags,
    {
      "ghr:environment"        = var.prefix
      "ghr:ssm_config_path"    = "${var.ssm.paths.root}/${var.ssm.paths.config}"
      "ghr:runner_name_prefix" = var.runner.name_prefix
    },
  )

  role_path                       = var.runner.iam.path == null ? "/${var.prefix}/" : var.runner.iam.path
  instance_profile_path           = var.config.instance_profile_path == null ? "/${var.prefix}/" : var.config.instance_profile_path
  userdata_template               = var.config.user_data.template == null ? local.default_userdata_template[var.runner.os] : var.config.user_data.template
  s3_location_runner_distribution = var.config.binaries_syncer.enabled ? "s3://${try(var.config.binaries_syncer.s3.id, "")}/${try(var.config.binaries_syncer.s3.key, "")}" : ""
  default_ami = {
    "windows" = { name = ["Windows_Server-2022-English-Full-ECS_Optimized-*"] }
    "linux"   = var.runner.architecture == "arm64" ? { name = ["al2023-ami-2023.*-kernel-6.*-arm64"] } : { name = ["al2023-ami-2023.*-kernel-6.*-x86_64"] }
    "osx"     = var.runner.architecture == "arm64" ? { name = ["amzn-ec2-macos-15.*-arm64"] } : { name = ["amzn-ec2-macos-15.*"] }
  }

  default_userdata_template = {
    "windows" = "${path.module}/templates/user-data.ps1"
    "linux"   = "${path.module}/templates/user-data.sh"
    "osx"     = "${path.module}/templates/user-data-osx.sh"
  }

  userdata_install_runner = {
    "windows" = "${path.module}/templates/install-runner.ps1"
    "linux"   = "${path.module}/templates/install-runner.sh"
    "osx"     = "${path.module}/templates/install-runner-osx.sh"
  }

  userdata_start_runner = {
    "windows" = "${path.module}/templates/start-runner.ps1"
    "linux"   = "${path.module}/templates/start-runner.sh"
    "osx"     = "${path.module}/templates/start-runner-osx.sh"
  }

  # Handle AMI configuration
  ami_config = var.config.ami != null ? var.config.ami : {
    filter           = local.default_ami[var.runner.os]
    owners           = ["amazon"]
    id_ssm_parameter = null
    kms_key          = null
  }
  ami_kms_key_enabled       = local.ami_config.kms_key != null
  ami_kms_key_arn           = local.ami_kms_key_enabled ? local.ami_config.kms_key.arn : null
  ami_filter                = merge(local.default_ami[var.runner.os], local.ami_config.filter)
  ami_id_ssm_external       = local.ami_config.id_ssm_parameter != null
  ami_id_ssm_module_managed = !local.ami_id_ssm_external
  ami_id_ssm_parameter_arn  = local.ami_id_ssm_external ? local.ami_config.id_ssm_parameter.arn : null
  # Extract parameter name from ARN (format: arn:aws:ssm:region:account:parameter/path/to/param)
  ami_id_ssm_parameter_name = local.ami_id_ssm_external ? try(regex("parameter(/.+)$", local.ami_id_ssm_parameter_arn)[0], null) : null

  user_data = var.config.user_data.enabled ? (var.config.user_data.content == null ? templatefile(local.userdata_template, {
    enable_debug_logging            = var.config.user_data.debug_logging_enabled
    s3_location_runner_distribution = local.s3_location_runner_distribution
    pre_install                     = var.config.user_data.pre_install
    install_runner = templatefile(local.userdata_install_runner[var.runner.os], {
      S3_LOCATION_RUNNER_DISTRIBUTION = local.s3_location_runner_distribution
      RUNNER_ARCHITECTURE             = var.runner.architecture
    })
    post_install       = var.config.user_data.post_install
    hook_job_started   = var.runner.hooks.job_started
    hook_job_completed = var.runner.hooks.job_completed
    start_runner = templatefile(local.userdata_start_runner[var.runner.os], {
      metadata_tags = var.config.metadata_options != null ? var.config.metadata_options.instance_metadata_tags : "enabled"
    })
    ghes_url        = var.github.enterprise_server.url
    ghes_ssl_verify = var.github.enterprise_server.ssl_verify

    ## retain these for backwards compatibility
    environment                     = var.prefix
    enable_cloudwatch_agent         = var.config.cloudwatch_agent.enabled
    ssm_key_cloudwatch_agent_config = var.config.cloudwatch_agent.enabled ? aws_ssm_parameter.cloudwatch_agent_config_runner[0].name : ""
  }) : var.config.user_data.content) : ""

  encoded_user_data = (
    var.runner.os == "linux" ? base64gzip(local.user_data) :
    var.runner.os == "windows" ? base64encode(local.user_data) :
    var.runner.os == "osx" ? base64encode(local.user_data) :
    null
  )

  # All-null defaults so both branches below share one object type.
  network_interfaces_zero = {
    associate_carrier_ip_address      = null
    associate_public_ip_address       = null
    delete_on_termination             = null
    description                       = null
    device_index                      = null
    interface_type                    = null
    ipv4_address_count                = null
    ipv4_addresses                    = null
    ipv4_prefix_count                 = null
    ipv4_prefixes                     = null
    ipv6_address_count                = null
    ipv6_addresses                    = null
    ipv6_prefix_count                 = null
    ipv6_prefixes                     = null
    network_card_index                = null
    network_interface_id              = null
    primary_ipv6                      = null
    private_ip_address                = null
    security_groups                   = null
    subnet_id                         = null
    connection_tracking_specification = null
    ena_srd_specification             = null
  }

  network_interfaces = length(var.config.network_interfaces) > 0 ? var.config.network_interfaces : (
    var.config.associate_public_ipv4_address ? [merge(local.network_interfaces_zero, {
      associate_public_ip_address = true
      security_groups = compact(concat(
        var.config.managed_security_group_enabled ? [aws_security_group.runner_sg[0].id] : [],
        var.config.additional_security_group_ids,
      ))
    })] : []
  )
}

data "aws_ami" "runner" {
  count = local.ami_id_ssm_module_managed ? 1 : 0

  most_recent = "true"

  dynamic "filter" {
    for_each = local.ami_filter
    content {
      name   = filter.key
      values = filter.value
    }
  }

  owners = local.ami_config.owners
}

resource "aws_ssm_parameter" "runner_ami_id" {
  count     = local.ami_id_ssm_module_managed ? 1 : 0
  name      = "${var.ssm.paths.root}/${var.ssm.paths.config}/ami_id"
  type      = "String"
  data_type = "aws:ec2:image"
  value     = data.aws_ami.runner[0].id

  tags = merge(
    local.provider_tags,
    local.ssm_parameter_tags,
    {
      # Remove parentheses from AMI name to comply with AWS tag constraints
      "ghr:ami_name" = replace(data.aws_ami.runner[0].name, "/[()]/", "")
    },
    {
      "ghr:ami_creation_date" = data.aws_ami.runner[0].creation_date
    },
    {
      "ghr:ami_deprecation_time" = data.aws_ami.runner[0].deprecation_time
    }
  )
}

resource "aws_launch_template" "runner" {
  name = "${var.prefix}-action-runner"

  dynamic "block_device_mappings" {
    for_each = var.config.block_device_mappings != null ? var.config.block_device_mappings : []
    content {
      device_name = block_device_mappings.value.device_name

      ebs {
        delete_on_termination      = block_device_mappings.value.delete_on_termination
        encrypted                  = block_device_mappings.value.encrypted
        iops                       = block_device_mappings.value.iops
        kms_key_id                 = block_device_mappings.value.kms_key_id
        snapshot_id                = block_device_mappings.value.snapshot_id
        throughput                 = block_device_mappings.value.throughput
        volume_initialization_rate = block_device_mappings.value.volume_initialization_rate
        volume_size                = block_device_mappings.value.volume_size
        volume_type                = block_device_mappings.value.volume_type
      }
    }
  }

  dynamic "metadata_options" {
    for_each = var.config.metadata_options != null ? [var.config.metadata_options] : []

    content {
      http_endpoint               = metadata_options.value.http_endpoint
      http_tokens                 = metadata_options.value.http_tokens
      http_put_response_hop_limit = metadata_options.value.http_put_response_hop_limit
      instance_metadata_tags      = metadata_options.value.instance_metadata_tags
    }
  }

  dynamic "metadata_options" {
    for_each = var.config.metadata_options != null ? [] : [0]

    content {
      instance_metadata_tags = "enabled"
    }
  }

  dynamic "credit_specification" {
    for_each = var.config.credit_specification != null ? [var.config.credit_specification] : []
    content {
      cpu_credits = credit_specification.value
    }
  }

  dynamic "cpu_options" {
    for_each = var.config.cpu_options != null ? [var.config.cpu_options] : []
    content {
      core_count            = try(cpu_options.value.core_count, null)
      threads_per_core      = try(cpu_options.value.threads_per_core, null)
      amd_sev_snp           = try(cpu_options.value.amd_sev_snp, null)
      nested_virtualization = try(cpu_options.value.nested_virtualization, null)
    }
  }

  dynamic "placement" {
    for_each = var.config.placement != null ? [var.config.placement] : []
    content {
      affinity                = try(placement.value.affinity, null)
      availability_zone       = try(placement.value.availability_zone, null)
      group_id                = try(placement.value.group_id, null)
      group_name              = try(placement.value.group_name, null)
      host_id                 = try(placement.value.host_id, null)
      host_resource_group_arn = try(placement.value.host_resource_group_arn, null)
      spread_domain           = try(placement.value.spread_domain, null)
      tenancy                 = try(placement.value.tenancy, null)
      partition_number        = try(placement.value.partition_number, null)
    }
  }

  dynamic "license_specification" {
    for_each = var.config.license_specifications
    content {
      license_configuration_arn = license_specification.value.license_configuration_arn
    }
  }

  monitoring {
    enabled = var.config.detailed_monitoring_enabled
  }

  iam_instance_profile {
    name = var.config.instance_profile != null ? var.config.instance_profile.name : aws_iam_instance_profile.runner[0].name
  }

  instance_initiated_shutdown_behavior = "terminate"
  image_id                             = "resolve:ssm:${local.ami_id_ssm_module_managed ? aws_ssm_parameter.runner_ami_id[0].arn : local.ami_id_ssm_parameter_arn}"
  key_name                             = var.config.key_name
  ebs_optimized                        = var.config.ebs_optimized

  vpc_security_group_ids = !var.config.associate_public_ipv4_address ? compact(concat(
    var.config.managed_security_group_enabled ? [aws_security_group.runner_sg[0].id] : [],
    var.config.additional_security_group_ids,
  )) : []

  tag_specifications {
    resource_type = "instance"
    tags          = local.runner_tags
  }

  tag_specifications {
    resource_type = "volume"
    tags          = local.runner_tags
  }

  # We avoid including the "spot-instances-request" tag_specifications block when on_demand_failover_for_errors is defined,
  # because when using on-demand fallback, the spot instance request resource is not created and thus the tags would not apply.
  # Additionally, tagging spot requests via the CreateFleetCommand in the Lambda function does not work as expected,
  # so we rely on Terraform to manage these tags only when spot is exclusively used without on-demand failover.
  dynamic "tag_specifications" {
    for_each = var.config.instance_target_capacity_type == "spot" && length(var.config.on_demand_failover_for_errors) == 0 ? [1] : [] # Include the block only if the value is "spot" and on_demand_failover_for_errors is not enabled
    content {
      resource_type = "spot-instances-request"
      tags          = local.runner_tags
    }
  }

  tag_specifications {
    resource_type = "network-interface"
    tags          = local.runner_tags
  }

  user_data = local.encoded_user_data

  tags = local.provider_tags

  update_default_version = true

  dynamic "network_interfaces" {
    for_each = local.network_interfaces
    content {
      associate_carrier_ip_address = try(network_interfaces.value.associate_carrier_ip_address, null)
      associate_public_ip_address  = try(network_interfaces.value.associate_public_ip_address, null)
      delete_on_termination        = try(network_interfaces.value.delete_on_termination, null)
      description                  = try(network_interfaces.value.description, null)
      device_index                 = try(network_interfaces.value.device_index, null)
      interface_type               = try(network_interfaces.value.interface_type, null)
      ipv4_address_count           = try(network_interfaces.value.ipv4_address_count, null)
      ipv4_addresses               = try(network_interfaces.value.ipv4_addresses, null)
      ipv4_prefix_count            = try(network_interfaces.value.ipv4_prefix_count, null)
      ipv4_prefixes                = try(network_interfaces.value.ipv4_prefixes, null)
      ipv6_address_count           = try(network_interfaces.value.ipv6_address_count, null)
      ipv6_addresses               = try(network_interfaces.value.ipv6_addresses, null)
      ipv6_prefix_count            = try(network_interfaces.value.ipv6_prefix_count, null)
      ipv6_prefixes                = try(network_interfaces.value.ipv6_prefixes, null)
      network_card_index           = try(network_interfaces.value.network_card_index, null)
      network_interface_id         = try(network_interfaces.value.network_interface_id, null)
      primary_ipv6                 = try(network_interfaces.value.primary_ipv6, null)
      private_ip_address           = try(network_interfaces.value.private_ip_address, null)
      security_groups              = try(network_interfaces.value.security_groups, null)
      subnet_id                    = try(network_interfaces.value.subnet_id, null)

      dynamic "connection_tracking_specification" {
        for_each = try(network_interfaces.value.connection_tracking_specification, null) != null ? [network_interfaces.value.connection_tracking_specification] : []
        content {
          tcp_established_timeout = try(connection_tracking_specification.value.tcp_established_timeout, null)
          udp_stream_timeout      = try(connection_tracking_specification.value.udp_stream_timeout, null)
          udp_timeout             = try(connection_tracking_specification.value.udp_timeout, null)
        }
      }

      dynamic "ena_srd_specification" {
        for_each = try(network_interfaces.value.ena_srd_specification, null) != null ? [network_interfaces.value.ena_srd_specification] : []
        content {
          ena_srd_enabled = try(ena_srd_specification.value.ena_srd_enabled, null)
          dynamic "ena_srd_udp_specification" {
            for_each = try(ena_srd_specification.value.ena_srd_udp_specification, null) != null ? [ena_srd_specification.value.ena_srd_udp_specification] : []
            content {
              ena_srd_udp_enabled = try(ena_srd_udp_specification.value.ena_srd_udp_enabled, null)
            }
          }
        }
      }
    }
  }
}

resource "aws_security_group" "runner_sg" {
  count       = var.config.managed_security_group_enabled ? 1 : 0
  name_prefix = "${var.prefix}-github-actions-runner-sg"
  description = "Github Actions Runner security group"

  vpc_id = var.config.vpc_id

  ingress = []

  dynamic "egress" {
    for_each = var.config.egress_rules
    iterator = each

    content {
      cidr_blocks      = each.value.cidr_blocks
      ipv6_cidr_blocks = each.value.ipv6_cidr_blocks
      prefix_list_ids  = each.value.prefix_list_ids
      from_port        = each.value.from_port
      protocol         = each.value.protocol
      security_groups  = each.value.security_groups
      self             = each.value.self
      to_port          = each.value.to_port
      description      = each.value.description
    }
  }

  tags = merge(
    local.provider_tags,
    {
      "Name" = format("%s", local.name_sg)
    },
  )
}
