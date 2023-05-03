locals {
  tags = merge(
    {
      "Name" = format("%s-action-runner", var.prefix)
    },
    {
      "ghr:ssm_config_path" = "${var.ssm_paths.root}/${var.ssm_paths.config}"
    },
    var.tags,
  )

  name_sg                         = var.overrides["name_sg"] == "" ? local.tags["Name"] : var.overrides["name_sg"]
  name_runner                     = var.overrides["name_runner"] == "" ? local.tags["Name"] : var.overrides["name_runner"]
  role_path                       = var.role_path == null ? "/${var.prefix}/" : var.role_path
  instance_profile_path           = var.instance_profile_path == null ? "/${var.prefix}/" : var.instance_profile_path
  lambda_zip                      = var.lambda_zip == null ? "${path.module}/../../lambdas/functions/control-plane/runners.zip" : var.lambda_zip
  userdata_template               = var.userdata_template == null ? local.default_userdata_template[var.runner_os] : var.userdata_template
  kms_key_arn                     = var.kms_key_arn != null ? var.kms_key_arn : ""
  s3_location_runner_distribution = var.enable_runner_binaries_syncer ? "s3://${var.s3_runner_binaries.id}/${var.s3_runner_binaries.key}" : ""
  default_ami = {
    "windows" = { name = ["Windows_Server-2022-English-Core-ContainersLatest-*"] }
    "linux"   = var.runner_architecture == "arm64" ? { name = ["amzn2-ami-kernel-5.*-hvm-*-arm64-gp2"] } : { name = ["amzn2-ami-kernel-5.*-hvm-*-x86_64-gp2"] }
  }

  default_userdata_template = {
    "windows" = "${path.module}/templates/user-data.ps1"
    "linux"   = "${path.module}/templates/user-data.sh"
  }

  userdata_install_runner = {
    "windows" = "${path.module}/templates/install-runner.ps1"
    "linux"   = "${path.module}/templates/install-runner.sh"
  }

  userdata_start_runner = {
    "windows" = "${path.module}/templates/start-runner.ps1"
    "linux"   = "${path.module}/templates/start-runner.sh"
  }

  ami_kms_key_arn = var.ami_kms_key_arn != null ? var.ami_kms_key_arn : ""
  ami_filter      = coalesce(var.ami_filter, local.default_ami[var.runner_os])

  enable_job_queued_check = var.enable_job_queued_check == null ? !var.enable_ephemeral_runners : var.enable_job_queued_check
}

data "aws_ami" "runner" {
  most_recent = "true"

  dynamic "filter" {
    for_each = local.ami_filter
    content {
      name   = filter.key
      values = filter.value
    }
  }

  owners = var.ami_owners
}

resource "aws_launch_template" "runner" {
  name = "${var.prefix}-action-runner"

  dynamic "block_device_mappings" {
    for_each = var.block_device_mappings != null ? var.block_device_mappings : []
    content {
      device_name = block_device_mappings.value.device_name

      ebs {
        delete_on_termination = block_device_mappings.value.delete_on_termination
        encrypted             = block_device_mappings.value.encrypted
        iops                  = block_device_mappings.value.iops
        kms_key_id            = block_device_mappings.value.kms_key_id
        snapshot_id           = block_device_mappings.value.snapshot_id
        throughput            = block_device_mappings.value.throughput
        volume_size           = block_device_mappings.value.volume_size
        volume_type           = block_device_mappings.value.volume_type
      }
    }
  }

  dynamic "metadata_options" {
    for_each = var.metadata_options != null ? [var.metadata_options] : []

    content {
      http_endpoint               = metadata_options.value.http_endpoint
      http_tokens                 = metadata_options.value.http_tokens
      http_put_response_hop_limit = metadata_options.value.http_put_response_hop_limit
      instance_metadata_tags      = metadata_options.value.instance_metadata_tags
    }
  }

  dynamic "metadata_options" {
    for_each = var.metadata_options != null ? [] : [0]

    content {
      instance_metadata_tags = "enabled"
    }
  }

  monitoring {
    enabled = var.enable_runner_detailed_monitoring
  }

  iam_instance_profile {
    name = aws_iam_instance_profile.runner.name
  }

  instance_initiated_shutdown_behavior = "terminate"
  image_id                             = data.aws_ami.runner.id
  key_name                             = var.key_name

  vpc_security_group_ids = compact(concat(
    var.enable_managed_runner_security_group ? [aws_security_group.runner_sg[0].id] : [],
    var.runner_additional_security_group_ids,
  ))

  tag_specifications {
    resource_type = "instance"
    tags = merge(
      local.tags,
      {
        "Name" = format("%s", local.name_runner)
      },
      {
        "ghr:runner_name_prefix" = var.runner_name_prefix
      },
      var.runner_ec2_tags
    )
  }

  tag_specifications {
    resource_type = "volume"
    tags = merge(
      local.tags,
      {
        "Name" = format("%s", local.name_runner)
      },
      {
        "ghr:runner_name_prefix" = var.runner_name_prefix
      },
      var.runner_ec2_tags
    )
  }

  user_data = var.enable_userdata ? base64encode(templatefile(local.userdata_template, {
    enable_debug_logging            = var.enable_user_data_debug_logging
    s3_location_runner_distribution = local.s3_location_runner_distribution
    pre_install                     = var.userdata_pre_install
    install_runner = templatefile(local.userdata_install_runner[var.runner_os], {
      S3_LOCATION_RUNNER_DISTRIBUTION = local.s3_location_runner_distribution
      RUNNER_ARCHITECTURE             = var.runner_architecture
    })
    post_install = var.userdata_post_install
    start_runner = templatefile(local.userdata_start_runner[var.runner_os], {
      metadata_tags = var.metadata_options != null ? var.metadata_options.instance_metadata_tags : "enabled"
    })
    ghes_url        = var.ghes_url
    ghes_ssl_verify = var.ghes_ssl_verify

    ## retain these for backwards compatibility
    environment                     = var.prefix
    enable_cloudwatch_agent         = var.enable_cloudwatch_agent
    ssm_key_cloudwatch_agent_config = var.enable_cloudwatch_agent ? aws_ssm_parameter.cloudwatch_agent_config_runner[0].name : ""
  })) : ""

  tags = local.tags

  update_default_version = true
}

resource "aws_security_group" "runner_sg" {
  count       = var.enable_managed_runner_security_group ? 1 : 0
  name_prefix = "${var.prefix}-github-actions-runner-sg"
  description = "Github Actions Runner security group"

  vpc_id = var.vpc_id

  dynamic "egress" {
    for_each = var.egress_rules
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
    local.tags,
    {
      "Name" = format("%s", local.name_sg)
    },
  )
}
