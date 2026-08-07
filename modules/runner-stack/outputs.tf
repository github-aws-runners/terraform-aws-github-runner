output "runner" {
  description = "Common runner resources. The role is null when an external runner role is used."
  value = {
    role = one(aws_iam_role.runner[*])
  }
}

output "scale_up" {
  description = "Scale-up control-plane resources."
  value = {
    lambda    = aws_lambda_function.scale_up
    log_group = aws_cloudwatch_log_group.scale_up
    role      = aws_iam_role.scale_up
  }
}

output "scale_down" {
  description = "Scale-down control-plane resources."
  value = {
    lambda    = aws_lambda_function.scale_down
    log_group = aws_cloudwatch_log_group.scale_down
    role      = aws_iam_role.scale_down
  }
}

output "pool" {
  description = "Scheduled pool resources. Null when no pool configuration is supplied."
  value       = one(module.pool[*].pool)
}

output "provider" {
  description = "Selected compute provider type and its provider-specific resources."
  value = {
    type = local.provider.type
    ec2  = one(module.ec2[*].resources)
  }
}
