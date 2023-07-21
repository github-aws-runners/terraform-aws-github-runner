data "aws_ami" "docker_cache_ami" {
  most_recent = false

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-arm64-server-20230601"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  owners = ["099720109477"] # Canonical
}

# data "aws_security_group" "runner_sg" {
#   vpc_id = var.vpc_id
# }

resource "aws_security_group" "docker_cache_sg" {
  name_prefix = "${local.environment}-docker-cache-sg"
  vpc_id      = module.base.vpc.vpc_id
  tags = {
    Name = "docker-cache-sg"
  }
}

resource "aws_vpc_security_group_ingress_rule" "docker" {
  security_group_id            = aws_security_group.docker_cache_sg.id
  referenced_security_group_id = aws_security_group.runner_sg.id
  ip_protocol                  = "tcp"
  from_port                    = 5000
  to_port                      = 5000
}

resource "aws_vpc_security_group_egress_rule" "docker" {
  security_group_id            = aws_security_group.docker_cache_sg.id
  referenced_security_group_id = aws_security_group.docker_cache_sg.id
  ip_protocol                  = "tcp"
  from_port                    = 5000
  to_port                      = 5000
}

resource "aws_route53_zone" "private" {
  name = "platform.internal"
  vpc {
    vpc_id = module.base.vpc.vpc_id
  }
}

resource "aws_route53_record" "docker_cache" {
  zone_id = aws_route53_zone.private.zone_id
  name    = "docker-cache.platform.internal"
  type    = "A"
  alias {
    name                   = aws_lb.docker_cache.dns_name
    zone_id                = aws_lb.docker_cache.zone_id
    evaluate_target_health = true
  }
}

resource "aws_iam_role" "docker_cache" {
  name               = "${local.environment}-docker-cache-role"
  assume_role_policy = templatefile("../../modules/runners/policies/instance-role-trust-policy.json", {})
  tags = {
    Name = "platform-docker-cache-tf"
  }
}

resource "aws_iam_instance_profile" "docker_cache" {
  name = "${local.environment}-docker-cache-profile"
  role = aws_iam_role.docker_cache.name
}

resource "aws_iam_role_policy" "docker_cache_session_manager_aws_managed" {
  name   = "docker-cache-ssm-session"
  count  = 1
  role   = aws_iam_role.docker_cache.name
  policy = templatefile("../../modules/runners/policies/instance-ssm-policy.json", {})
}

resource "aws_launch_template" "docker_cache" {
  image_id      = data.aws_ami.docker_cache_ami.id
  instance_type = "t4g.micro"
  name_prefix   = "${local.environment}-docker-cache"

  vpc_security_group_ids = [
    aws_security_group.runner_sg.id,
    aws_security_group.docker_cache_sg.id
  ]

  iam_instance_profile {
    name = aws_iam_instance_profile.docker_cache.name
  }

  user_data = filebase64("${path.module}/templates/user-data/docker_cache_user_data.sh")

  block_device_mappings {
    device_name = "/dev/sda1"
    ebs {
      volume_size = 50
      volume_type = "gp3"
    }
  }

  tags = {
    Name = "platform-docker-cache-tf"
  }
}

resource "aws_autoscaling_group" "docker_cache" {
  name_prefix         = "${local.environment}-docker-cache"
  vpc_zone_identifier = module.base.vpc.private_subnets
  launch_template {
    id      = aws_launch_template.docker_cache.id
    version = "$Latest"
  }
  min_size                  = 1
  max_size                  = 2
  desired_capacity          = 2
  health_check_grace_period = 300
  health_check_type         = "ELB"

  tag {
    key                 = "Name"
    value               = "platform-docker-cache-tf"
    propagate_at_launch = true
  }
}

resource "aws_autoscaling_attachment" "docker_cache" {
  autoscaling_group_name = aws_autoscaling_group.docker_cache.name
  lb_target_group_arn    = aws_lb_target_group.docker_cache.arn
}

resource "aws_lb" "docker_cache" {
  name                       = "platform-docker-cache-tf"
  internal                   = true
  load_balancer_type         = "application"
  subnets                    = module.base.vpc.private_subnets
  security_groups            = [aws_security_group.docker_cache_sg.id]
  enable_deletion_protection = true
  tags = {
    Name = "platform-docker-cache-tf"
  }
}

resource "aws_lb_target_group" "docker_cache" {
  name     = "platform-docker-cache-tf"
  port     = 5000
  protocol = "HTTP"
  vpc_id   = module.base.vpc.vpc_id
}

resource "aws_lb_listener" "docker_cache" {
  load_balancer_arn = aws_lb.docker_cache.arn
  port              = 5000
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.docker_cache.arn
  }
}
