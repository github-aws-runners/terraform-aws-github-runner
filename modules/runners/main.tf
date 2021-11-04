locals {
  tags = merge(
    {
      "Name" = format("%s-action-runner", var.environment)
    },
    {
      "Environment" = format("%s", var.environment)
    },
    var.tags,
  )

  name_sg                        = var.overrides["name_sg"] == "" ? local.tags["Name"] : var.overrides["name_sg"]
  name_runner                    = var.overrides["name_runner"] == "" ? local.tags["Name"] : var.overrides["name_runner"]
  role_path                      = var.role_path == null ? "/${var.environment}/" : var.role_path
  instance_profile_path          = var.instance_profile_path == null ? "/${var.environment}/" : var.instance_profile_path
  lambda_zip                     = var.lambda_zip == null ? "${path.module}/lambdas/runners/runners.zip" : var.lambda_zip
  userdata_template              = var.userdata_template == null ? "${path.module}/templates/user-data.sh" : var.userdata_template
  userdata_arm_patch             = "${path.module}/templates/arm-runner-patch.tpl"
  userdata_install_config_runner = "${path.module}/templates/install-config-runner.sh"

  instance_types = distinct(var.instance_types == null ? [var.instance_type] : var.instance_types)

  kms_key_arn = var.kms_key_arn != null ? var.kms_key_arn : ""
}

data "aws_ami" "runner" {
  most_recent = "true"

  dynamic "filter" {
    for_each = var.ami_filter
    content {
      name   = filter.key
      values = filter.value
    }
  }

  owners = var.ami_owners
}

resource "aws_launch_template" "runner" {
  count = length(local.instance_types)

  name = "${var.environment}-action-runner-${local.instance_types[count.index]}"

  dynamic "block_device_mappings" {
    for_each = [var.block_device_mappings]
    content {
      device_name = lookup(block_device_mappings.value, "device_name", "/dev/xvda")

      ebs {
        delete_on_termination = lookup(block_device_mappings.value, "delete_on_termination", true)
        volume_type           = lookup(block_device_mappings.value, "volume_type", "gp3")
        volume_size           = lookup(block_device_mappings.value, "volume_size", var.volume_size)
        encrypted             = lookup(block_device_mappings.value, "encrypted", true)
        iops                  = lookup(block_device_mappings.value, "iops", null)
      }
    }
  }

  dynamic "metadata_options" {
    for_each = var.metadata_options != null ? [var.metadata_options] : []

    content {
      http_endpoint               = metadata_options.value.http_endpoint
      http_tokens                 = metadata_options.value.http_tokens
      http_put_response_hop_limit = metadata_options.value.http_put_response_hop_limit
    }
  }

  iam_instance_profile {
    name = aws_iam_instance_profile.runner.name
  }

  instance_initiated_shutdown_behavior = "terminate"

  dynamic "instance_market_options" {
    for_each = var.market_options != null ? [var.market_options] : []

    content {
      market_type = instance_market_options.value
    }
  }

  image_id      = data.aws_ami.runner.id
  instance_type = local.instance_types[count.index]
  key_name      = var.key_name

  vpc_security_group_ids = compact(concat(
    [aws_security_group.runner_sg.id],
    var.runner_additional_security_group_ids,
  ))

  tag_specifications {
    resource_type = "instance"
    tags = merge(
      local.tags,
      {
        "Name" = format("%s", local.name_runner)
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
    )
  }


  user_data = base64encode(templatefile(local.userdata_template, {
    environment                     = var.environment
    pre_install                     = var.userdata_pre_install
    post_install                    = var.userdata_post_install
    enable_cloudwatch_agent         = var.enable_cloudwatch_agent
    ssm_key_cloudwatch_agent_config = var.enable_cloudwatch_agent ? aws_ssm_parameter.cloudwatch_agent_config_runner[0].name : ""
    ghes_url                        = var.ghes_url
    ghes_ssl_verify                 = var.ghes_ssl_verify
    install_config_runner           = local.install_config_runner
  }))

  tags = local.tags

  update_default_version = true
}

locals {
  arm_patch = var.runner_architecture == "arm64" ? templatefile(local.userdata_arm_patch, {}) : ""
  install_config_runner = templatefile(local.userdata_install_config_runner, {
    environment                     = var.environment
    s3_location_runner_distribution = var.s3_location_runner_binaries
    run_as_root_user                = var.runner_as_root ? "root" : ""
    arm_patch                       = local.arm_patch
  })
}

resource "aws_security_group" "runner_sg" {
  name_prefix = "${var.environment}-github-actions-runner-sg"
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
