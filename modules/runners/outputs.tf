output "launch_template" {
  value = aws_launch_template.runner
}

output "role_runner" {
  value = aws_iam_role.runner
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

output "runner_config_storage_backend" {
  description = "Storage backend used for label-scoped runner bootstrap config and one-time registration/JIT config."
  value       = local.runner_config_storage_backend
}

output "runner_config_dynamodb_table" {
  description = "DynamoDB table used for label-scoped runner bootstrap config and one-time registration/JIT config when the DynamoDB backend is enabled."
  value       = try(aws_dynamodb_table.runner_config[0], null)
}

output "runners_log_groups" {
  description = "List of log groups from different log files of runner machine."
  value       = try(aws_cloudwatch_log_group.gh_runners, [])
}

output "logfiles" {
  value       = local.logfiles
  description = "List of logfiles to send to CloudWatch. Object description: `log_group_name`: Name of the log group, `file_path`: path to the log file, `log_stream_name`: name of the log stream."
}
