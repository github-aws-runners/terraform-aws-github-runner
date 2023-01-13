output "launch_template" {
  value = aws_launch_template.runner
}

output "role_runner" {
  value = aws_iam_role.runner
}

output "lambda_scale_up" {
  value = aws_lambda_function.scale_up
}

output "role_scale_up" {
  value = aws_iam_role.scale_up
}

output "lambda_scale_down" {
  value = aws_lambda_function.scale_down
}

output "role_scale_down" {
  value = aws_iam_role.scale_down
}

output "role_pool" {
  value = length(var.pool_config) == 0 ? null : module.pool[0].role_pool
}

output "logfiles" {
  value       = local.logfiles
  description = "List of logfiles to send to CloudWatch. Object description: `log_group_name`: Name of the log group, `file_path`: path to the log file, `log_stream_name`: name of the log stream."
}
