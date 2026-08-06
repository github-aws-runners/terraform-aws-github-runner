output "launch_template" {
  description = "EC2 launch template when the selected compute provider exposes one."
  value       = try(local.provider.launch_template, null)
}

output "role_runner" {
  description = "EC2 runner roles when the selected compute provider exposes them."
  value       = try(local.provider.role_runner, [])
}

output "lambda_scale_up" {
  value = aws_lambda_function.scale_up
}

output "lambda_scale_up_log_group" {
  value = aws_cloudwatch_log_group.scale_up
}

output "role_scale_up" {
  value = aws_iam_role.scale_up
}

output "lambda_scale_down" {
  value = aws_lambda_function.scale_down
}

output "lambda_scale_down_log_group" {
  value = aws_cloudwatch_log_group.scale_down
}

output "role_scale_down" {
  value = aws_iam_role.scale_down
}

output "lambda_pool" {
  value = try(module.pool[0].lambda, null)
}

output "lambda_pool_log_group" {
  value = try(module.pool[0].lambda_log_group, null)
}

output "role_pool" {
  value = try(module.pool[0].role_pool, null)
}

output "runners_log_groups" {
  description = "List of log groups from different log files of runner machine."
  value       = try(local.provider.runners_log_groups, [])
}

output "logfiles" {
  value       = try(local.provider.logfiles, [])
  description = "List of logfiles to send to CloudWatch. Object description: `log_group_name`: Name of the log group, `file_path`: path to the log file, `log_stream_name`: name of the log stream."
}
