output "cluster_arn" {
  description = "ARN of the ECS cluster hosting the scale-set listener."
  value       = local.cluster_arn
}

output "service" {
  description = "ECS service that keeps exactly one scale-set listener task running."
  value       = aws_ecs_service.listener
}

output "task_definition" {
  description = "ECS task definition for the scale-set listener container."
  value       = aws_ecs_task_definition.listener
}

output "task_role" {
  description = "IAM role assumed by the scale-set listener application."
  value       = aws_iam_role.task
}

output "execution_role" {
  description = "IAM role used by ECS to pull the image and publish container logs."
  value       = aws_iam_role.execution
}

output "log_group" {
  description = "CloudWatch Logs group receiving scale-set listener output."
  value       = aws_cloudwatch_log_group.listener
}

output "security_group" {
  description = "Module-created listener security group, or null when only external groups are used."
  value       = try(aws_security_group.listener[0], null)
}

output "listener" {
  description = "Aggregate ECS scale-set listener resources."
  value = {
    cluster_arn     = local.cluster_arn
    service         = aws_ecs_service.listener
    task_definition = aws_ecs_task_definition.listener
    task_role       = aws_iam_role.task
    execution_role  = aws_iam_role.execution
    log_group       = aws_cloudwatch_log_group.listener
    security_group  = try(aws_security_group.listener[0], null)
    alarm           = try(aws_cloudwatch_metric_alarm.listener_missing[0], null)
  }
}
