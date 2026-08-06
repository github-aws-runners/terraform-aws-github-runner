variable "prefix" {
  description = "Prefix used to reproduce the historical runner resource addresses."
  type        = string
}

variable "use_external_ami" {
  description = "Selects the historical external-AMI policy path instead of the module-managed AMI parameter path."
  type        = bool
}

locals {
  external_ami_parameter_arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/shared/runner-ami"
  ssm_root                   = "/github-action-runners/upgrade"
  ssm_config                 = "runners/config"
  role_path                  = "/${var.prefix}/"
  instance_profile_path      = "/${var.prefix}/"

  tags = {
    Name                  = "${var.prefix}-action-runner"
    "ghr:ssm_config_path" = "${local.ssm_root}/${local.ssm_config}"
  }

  runner_log_groups = [
    "/github-self-hosted-runners/${var.prefix}/messages",
    "/github-self-hosted-runners/${var.prefix}/user_data",
    "/github-self-hosted-runners/${var.prefix}/runner",
    "/github-self-hosted-runners/${var.prefix}/runner-startup",
  ]

  common_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream"]
      Resource = "*"
    }]
  })
}

data "aws_ami" "runner" {
  most_recent = true

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-kernel-6.*-x86_64"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }

  owners = ["amazon"]
}

resource "aws_ssm_parameter" "runner_ami_id" {
  count     = var.use_external_ami ? 0 : 1
  name      = "${local.ssm_root}/${local.ssm_config}/ami_id"
  type      = "String"
  data_type = "aws:ec2:image"
  value     = data.aws_ami.runner.id

  tags = merge(local.tags, {
    "ghr:ami_name"             = replace(data.aws_ami.runner.name, "/[()]/", "")
    "ghr:ami_creation_date"    = data.aws_ami.runner.creation_date
    "ghr:ami_deprecation_time" = data.aws_ami.runner.deprecation_time
  })
}

resource "aws_security_group" "runner_sg" {
  count       = 1
  name_prefix = "${var.prefix}-github-actions-runner-sg"
  description = "Github Actions Runner security group"
  vpc_id      = "vpc-12345678"
  ingress     = []

  egress {
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
    from_port        = 0
    protocol         = "-1"
    to_port          = 0
  }

  tags = merge(local.tags, { Name = local.tags.Name })
}

resource "aws_iam_role" "runner" {
  count = 1
  name  = "${substr("${var.prefix}-runner", 0, 54)}-${substr(md5("${var.prefix}-runner"), 0, 8)}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
  path = local.role_path
  tags = local.tags
}

resource "aws_iam_instance_profile" "runner" {
  count = 1
  name  = "${var.prefix}-runner-profile"
  role  = aws_iam_role.runner[0].name
  path  = local.instance_profile_path
  tags  = local.tags
}

resource "aws_launch_template" "runner" {
  name = "${var.prefix}-action-runner"

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      delete_on_termination = true
      encrypted             = true
      volume_size           = 30
      volume_type           = "gp3"
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  monitoring {
    enabled = false
  }

  iam_instance_profile {
    name = aws_iam_instance_profile.runner[0].name
  }

  instance_initiated_shutdown_behavior = "terminate"
  image_id = "resolve:ssm:${
    var.use_external_ami
    ? local.external_ami_parameter_arn
    : aws_ssm_parameter.runner_ami_id[0].arn
  }"
  ebs_optimized = false

  vpc_security_group_ids = [aws_security_group.runner_sg[0].id]

  tag_specifications {
    resource_type = "instance"
    tags = merge(local.tags, {
      Name                     = local.tags.Name
      "ghr:runner_name_prefix" = ""
    })
  }

  tag_specifications {
    resource_type = "volume"
    tags = merge(local.tags, {
      Name                     = local.tags.Name
      "ghr:runner_name_prefix" = ""
    })
  }

  tag_specifications {
    resource_type = "spot-instances-request"
    tags = merge(local.tags, {
      Name                     = local.tags.Name
      "ghr:runner_name_prefix" = ""
    })
  }

  tag_specifications {
    resource_type = "network-interface"
    tags = merge(local.tags, {
      Name                     = local.tags.Name
      "ghr:runner_name_prefix" = ""
    })
  }

  user_data              = base64gzip("")
  tags                   = local.tags
  update_default_version = true
}

resource "aws_ssm_parameter" "runner_config_run_as" {
  name  = "${local.ssm_root}/${local.ssm_config}/run_as"
  type  = "String"
  value = "ec2-user"
  tags  = local.tags
}

resource "aws_ssm_parameter" "runner_enable_cloudwatch" {
  name  = "${local.ssm_root}/${local.ssm_config}/enable_cloudwatch"
  type  = "String"
  value = true
  tags  = local.tags
}

resource "aws_ssm_parameter" "cloudwatch_agent_config_runner" {
  count = 1
  name  = "${local.ssm_root}/${local.ssm_config}/cloudwatch_agent_config_runner"
  type  = "String"
  value = jsonencode({ logs = { logs_collected = { files = { collect_list = [] } } } })
  tags  = local.tags
}

resource "aws_cloudwatch_log_group" "gh_runners" {
  count             = length(local.runner_log_groups)
  name              = local.runner_log_groups[count.index]
  retention_in_days = 180
  log_group_class   = "STANDARD"
  tags              = local.tags
}

resource "aws_iam_role_policy" "cloudwatch" {
  count  = 1
  name   = "CloudWatchLogginAndMetrics"
  role   = aws_iam_role.runner[0].name
  policy = local.common_policy
}

resource "aws_iam_role_policy" "runner_session_manager_aws_managed" {
  count  = 1
  name   = "runner-ssm-session"
  role   = aws_iam_role.runner[0].name
  policy = local.common_policy
}

resource "aws_iam_role_policy" "ssm_parameters" {
  count  = 1
  name   = "runner-ssm-parameters"
  role   = aws_iam_role.runner[0].name
  policy = local.common_policy
}

resource "aws_iam_role_policy" "dist_bucket" {
  count  = 1
  name   = "distribution-bucket"
  role   = aws_iam_role.runner[0].name
  policy = local.common_policy
}

resource "aws_iam_role_policy_attachment" "xray_tracing" {
  count      = 1
  role       = aws_iam_role.runner[0].name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "describe_tags" {
  count  = 1
  name   = "runner-describe-tags"
  role   = aws_iam_role.runner[0].name
  policy = local.common_policy
}

resource "aws_iam_role_policy" "create_tag" {
  count  = 1
  name   = "runner-create-tags"
  role   = aws_iam_role.runner[0].name
  policy = local.common_policy
}

resource "aws_iam_role_policy_attachment" "managed_policies" {
  count      = 1
  role       = aws_iam_role.runner[0].name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "ec2" {
  count  = 1
  name   = "ec2"
  role   = aws_iam_role.runner[0].name
  policy = local.common_policy
}

resource "aws_iam_policy" "ami_id_ssm_parameter_read" {
  count       = var.use_external_ami ? 1 : 0
  name        = "${var.prefix}-ami-id-ssm-parameter-read"
  path        = local.role_path
  description = "Allows for reading ${var.prefix} GitHub runner AMI ID from an SSM parameter"
  tags        = local.tags
  policy      = local.common_policy
}
