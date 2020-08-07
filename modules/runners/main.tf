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

  name_sg               = var.overrides["name_sg"] == "" ? local.tags["Name"] : var.overrides["name_sg"]
  name_runner           = var.overrides["name_runner"] == "" ? local.tags["Name"] : var.overrides["name_runner"]
  role_path             = var.role_path == null ? "/${var.environment}/" : var.role_path
  instance_profile_path = var.instance_profile_path == null ? "/${var.environment}/" : var.instance_profile_path
  lambda_zip            = var.lambda_zip == null ? "${path.module}/lambdas/runners/runners.zip" : var.lambda_zip
  userdata_template     = var.userdata_template == null ? "${path.module}/templates/user-data.sh" : var.userdata_template
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
  name = "${var.environment}-action-runner"

  dynamic "block_device_mappings" {
    for_each = [var.block_device_mappings]
    content {
      device_name = "/dev/xvda"

      ebs {
        delete_on_termination = lookup(block_device_mappings.value, "delete_on_termination", true)
        volume_type           = lookup(block_device_mappings.value, "volume_type", "gp2")
        volume_size           = lookup(block_device_mappings.value, "volume_size", 30)
        encrypted             = lookup(block_device_mappings.value, "encrypted", true)
        iops                  = lookup(block_device_mappings.value, "iops", null)
      }
    }
  }

  iam_instance_profile {
    name = aws_iam_instance_profile.runner.name
  }

  instance_initiated_shutdown_behavior = "terminate"

  instance_market_options {
    market_type = var.market_options
  }

  image_id      = data.aws_ami.runner.id
  instance_type = var.instance_type

  vpc_security_group_ids = [aws_security_group.runner_sg.id]

  tag_specifications {
    resource_type = "instance"
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
    s3_location_runner_distribution = var.s3_location_runner_binaries
    service_user                    = var.runner_as_root ? "root" : "ec2-user"
    runner_architecture             = var.runner_architecture
  }))

  tags = local.tags
}

resource "aws_security_group" "runner_sg" {
  name_prefix = "${var.environment}-github-actions-runner-sg"
  description = "Github Actions Runner security group"

  vpc_id = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(
    local.tags,
    {
      "Name" = format("%s", local.name_sg)
    },
  )
}
