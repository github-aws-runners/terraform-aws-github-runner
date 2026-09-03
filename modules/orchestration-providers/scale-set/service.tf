resource "aws_ecs_service" "controller" {
  for_each = local.controller_groups

  name             = local.group_resource_names[each.key]
  cluster          = local.cluster_arn
  task_definition  = aws_ecs_task_definition.controller[each.key].arn
  desired_count    = 1
  launch_type      = "FARGATE"
  platform_version = var.ecs.service.platform_version

  scheduling_strategy                = "REPLICA"
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  enable_ecs_managed_tags            = true
  enable_execute_command             = false
  propagate_tags                     = "SERVICE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }

  network_configuration {
    assign_public_ip = false
    security_groups  = [aws_security_group.controller[each.key].id]
    subnets          = sort(tolist(var.network.subnet_ids))
  }

  tags = local.group_tags[each.key]

  depends_on = [
    aws_iam_role_policy.execution,
    aws_iam_role_policy.task,
    aws_ssm_parameter.reconciler_config,
  ]
}
