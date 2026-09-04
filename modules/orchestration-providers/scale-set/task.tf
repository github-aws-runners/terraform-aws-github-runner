resource "aws_ecs_task_definition" "controller" {
  for_each = local.controller_groups

  family                   = local.group_resource_names[each.key]
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.ecs.task.cpu)
  memory                   = tostring(var.ecs.task.memory)
  task_role_arn            = aws_iam_role.task[each.key].arn
  execution_role_arn       = aws_iam_role.execution[each.key].arn

  runtime_platform {
    cpu_architecture        = var.ecs.task.cpu_architecture
    operating_system_family = "LINUX"
  }

  dynamic "ephemeral_storage" {
    for_each = var.ecs.task.ephemeral_storage == null ? [] : [var.ecs.task.ephemeral_storage]

    content {
      size_in_gib = ephemeral_storage.value.size_in_gib
    }
  }

  container_definitions = jsonencode([
    {
      name                   = "scale-set-controller"
      image                  = local.resolved_container_image
      essential              = true
      user                   = var.container.user
      privileged             = false
      readonlyRootFilesystem = true
      stopTimeout            = var.container.stop_timeout_seconds
      versionConsistency     = "enabled"
      linuxParameters = {
        initProcessEnabled = true
        capabilities = {
          drop = ["ALL"]
        }
      }
      environment = concat(
        [
          {
            name  = "SCALE_SET_CONTROLLER_GROUP_NAME"
            value = each.key
          },
          {
            name  = "SCALE_SET_CONTROLLER_GROUP_CONFIG_PATH"
            value = local.group_config_paths[each.key]
          },
          {
            name  = "SCALE_SET_CONTROLLER_GROUP_CONFIG_REVISION"
            value = local.group_config_revisions[each.key]
          },
          {
            name  = "SCALE_SET_HEALTH_PORT"
            value = tostring(var.container.health_port)
          },
          {
            name  = "SCALE_SET_HEALTH_STALE_AFTER_SECONDS"
            value = tostring(var.container.health_stale_after_seconds)
          },
          {
            name  = "SCALE_SET_SHUTDOWN_TIMEOUT_SECONDS"
            value = tostring(var.container.shutdown_timeout_seconds)
          },
          {
            name  = "SCALE_SET_SESSION_CLOSE_TIMEOUT_SECONDS"
            value = tostring(var.container.session_close_timeout_seconds)
          },
          {
            name  = "SCALE_SET_RECONNECT_INITIAL_BACKOFF_SECONDS"
            value = tostring(var.container.reconnect_initial_backoff_seconds)
          },
          {
            name  = "SCALE_SET_RECONNECT_MAX_BACKOFF_SECONDS"
            value = tostring(var.container.reconnect_max_backoff_seconds)
          },
        ],
        [
          for name in sort(keys(local.group_compute_environment_variables[each.key])) : {
            name  = name
            value = local.group_compute_environment_variables[each.key][name]
          }
        ],
      )
      healthCheck = {
        command     = local.resolved_health_check_command
        interval    = var.container.health_check_interval
        timeout     = var.container.health_check_timeout
        retries     = var.container.health_check_retries
        startPeriod = var.container.health_check_start_period
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.controller[each.key].name
          "awslogs-region"        = data.aws_region.current.region
          "awslogs-stream-prefix" = "controller"
        }
      }
    }
  ])

  tags = local.group_tags[each.key]

  depends_on = [
    aws_iam_role_policy.execution,
    aws_iam_role_policy.task,
    aws_ssm_parameter.reconciler_config,
  ]
}
