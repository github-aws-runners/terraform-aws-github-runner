output "cluster" {
  description = "Managed or external ECS cluster selected for all controller groups."
  value = {
    arn     = local.cluster_arn
    managed = var.ecs.cluster.mode == "managed"
  }
}

output "controller_groups" {
  description = "Controller-group resources keyed by stable resolved group name."
  value = {
    for group_name, runner_names in local.controller_groups : group_name => {
      runner_configs  = runner_names
      config_path     = local.group_config_paths[group_name]
      config_revision = local.group_config_revisions[group_name]
      service = {
        id   = aws_ecs_service.controller[group_name].id
        name = aws_ecs_service.controller[group_name].name
      }
      task_definition = {
        arn    = aws_ecs_task_definition.controller[group_name].arn
        family = aws_ecs_task_definition.controller[group_name].family
      }
      task_role = {
        arn  = aws_iam_role.task[group_name].arn
        name = aws_iam_role.task[group_name].name
      }
      execution_role = {
        arn  = aws_iam_role.execution[group_name].arn
        name = aws_iam_role.execution[group_name].name
      }
      log_group = {
        arn  = aws_cloudwatch_log_group.controller[group_name].arn
        name = aws_cloudwatch_log_group.controller[group_name].name
      }
      security_group = {
        arn = aws_security_group.controller[group_name].arn
        id  = aws_security_group.controller[group_name].id
      }
    }
  }
}

output "reconciler_config_parameters" {
  description = "Non-secret SSM controller configuration parameters keyed by `<controller-group>/<runner-config>`. Values are intentionally not exposed."
  value = {
    for config_key, parameter in aws_ssm_parameter.reconciler_config : config_key => {
      arn  = parameter.arn
      name = parameter.name
      tier = parameter.tier
    }
  }
}

output "resolved_container_image" {
  description = "Container image reference selected for the controller task definitions."
  value       = local.resolved_container_image
}
