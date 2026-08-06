output "provider" {
  description = "Selected compute provider type and its provider-specific resources."
  value = {
    type = local.provider.type
    ec2  = module.ec2[0].resources
  }
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
