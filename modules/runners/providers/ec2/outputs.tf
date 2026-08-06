output "provider" {
  description = "EC2 resources and control-plane fragments consumed by the common runners module."
  value = {
    type = "ec2"
    scale_up = {
      environment_variables      = local.scale_up_environment_variables
      iam_policy_json            = local.scale_up_iam_policy_json
      additional_iam_policy_json = local.service_linked_role_policy_json
      managed_policy_enabled     = local.ami_id_ssm_parameter_name != null
      managed_policy_arn         = local.ami_id_ssm_parameter_name != null ? aws_iam_policy.ami_id_ssm_parameter_read[0].arn : null
    }
    scale_down = {
      environment_variables = local.scale_down_environment_variables
      iam_policy_json       = local.scale_down_iam_policy_json
    }
    pool = {
      environment_variables  = local.pool_environment_variables
      iam_policy_json        = local.pool_iam_policy_json
      managed_policy_enabled = local.ami_id_ssm_parameter_name != null
      managed_policy_arn     = local.ami_id_ssm_parameter_name != null ? aws_iam_policy.ami_id_ssm_parameter_read[0].arn : null
    }
    launch_template    = aws_launch_template.runner
    role_runner        = aws_iam_role.runner
    runners_log_groups = try(aws_cloudwatch_log_group.gh_runners, [])
    logfiles           = local.logfiles
  }
}
