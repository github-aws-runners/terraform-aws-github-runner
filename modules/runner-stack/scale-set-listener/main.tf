resource "aws_ecs_cluster" "listener" {
  count = var.config.ecs.cluster == null ? 1 : 0

  name = local.listener_name
  tags = local.tags
}

resource "aws_cloudwatch_log_group" "listener" {
  name              = local.log_group_name
  retention_in_days = var.config.logging.retention_in_days
  kms_key_id        = var.config.logging.kms_key_id
  log_group_class   = var.config.logging.log_class
  tags              = local.tags
}

resource "aws_security_group" "listener" {
  count = var.config.ecs.create_security_group ? 1 : 0

  name        = local.listener_name
  description = "Outbound HTTPS for the GitHub Actions scale-set listener"
  vpc_id      = var.config.ecs.vpc_id
  tags        = local.tags
}

resource "aws_vpc_security_group_egress_rule" "https_ipv4" {
  for_each = var.config.ecs.create_security_group ? toset(var.config.ecs.egress_ipv4_cidr_blocks) : toset([])

  security_group_id = aws_security_group.listener[0].id
  description       = "HTTPS to GitHub and AWS APIs"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  tags              = local.tags
}

resource "aws_vpc_security_group_egress_rule" "https_ipv6" {
  for_each = var.config.ecs.create_security_group ? toset(var.config.ecs.egress_ipv6_cidr_blocks) : toset([])

  security_group_id = aws_security_group.listener[0].id
  description       = "HTTPS to GitHub and AWS APIs"
  cidr_ipv6         = each.value
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  tags              = local.tags
}

resource "aws_ecs_task_definition" "listener" {
  family                   = local.listener_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.config.ecs.cpu)
  memory                   = tostring(var.config.ecs.memory)
  task_role_arn            = aws_iam_role.task.arn
  execution_role_arn       = aws_iam_role.execution.arn
  container_definitions    = jsonencode([local.container_definition])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = upper(var.config.ecs.architecture)
  }

  tags = local.tags

  depends_on = [
    aws_iam_role_policy.task_common,
    aws_iam_role_policy.task_runner_provider,
    aws_iam_role_policy_attachment.execution,
  ]

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_ecs_service" "listener" {
  name             = local.listener_name
  cluster          = local.cluster_arn
  task_definition  = aws_ecs_task_definition.listener.arn
  desired_count    = 1
  launch_type      = "FARGATE"
  platform_version = var.config.ecs.platform_version

  # GitHub permits only one active owner for a scale-set message session, so a
  # deployment intentionally stops the previous listener before starting the
  # replacement.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    assign_public_ip = var.config.ecs.assign_public_ip
    security_groups  = local.security_group_ids
    subnets          = var.config.ecs.subnet_ids
  }

  enable_ecs_managed_tags = true
  propagate_tags          = "SERVICE"
  tags                    = local.tags

  depends_on = [
    aws_vpc_security_group_egress_rule.https_ipv4,
    aws_vpc_security_group_egress_rule.https_ipv6,
  ]
}

resource "aws_cloudwatch_metric_alarm" "listener_missing" {
  count = var.config.alarm.enabled ? 1 : 0

  alarm_name          = "${local.listener_name}-missing"
  alarm_description   = "The scale-set listener has stopped publishing ECS task CPU metrics."
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 0
  treat_missing_data  = "breaching"

  dimensions = {
    ClusterName = local.cluster_name
    ServiceName = aws_ecs_service.listener.name
  }

  alarm_actions             = var.config.alarm.actions
  ok_actions                = var.config.alarm.ok_actions
  insufficient_data_actions = []
  tags                      = local.tags
}
