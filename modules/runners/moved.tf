moved {
  from = aws_ssm_parameter.runner_ami_id
  to   = module.ec2[0].aws_ssm_parameter.runner_ami_id
}

moved {
  from = aws_launch_template.runner
  to   = module.ec2[0].aws_launch_template.runner
}

moved {
  from = aws_security_group.runner_sg
  to   = module.ec2[0].aws_security_group.runner_sg
}

moved {
  from = aws_ssm_parameter.runner_config_run_as
  to   = module.ec2[0].aws_ssm_parameter.runner_config_run_as
}

moved {
  from = aws_ssm_parameter.runner_enable_cloudwatch
  to   = module.ec2[0].aws_ssm_parameter.runner_enable_cloudwatch
}

moved {
  from = aws_ssm_parameter.cloudwatch_agent_config_runner
  to   = module.ec2[0].aws_ssm_parameter.cloudwatch_agent_config_runner
}

moved {
  from = aws_cloudwatch_log_group.gh_runners
  to   = module.ec2[0].aws_cloudwatch_log_group.gh_runners
}

moved {
  from = aws_iam_role_policy.cloudwatch
  to   = module.ec2[0].aws_iam_role_policy.cloudwatch
}

moved {
  from = aws_iam_role.runner
  to   = module.ec2[0].aws_iam_role.runner
}

moved {
  from = aws_iam_instance_profile.runner
  to   = module.ec2[0].aws_iam_instance_profile.runner
}

moved {
  from = aws_iam_role_policy.runner_session_manager_aws_managed
  to   = module.ec2[0].aws_iam_role_policy.runner_session_manager_aws_managed
}

moved {
  from = aws_iam_role_policy.ssm_parameters
  to   = module.ec2[0].aws_iam_role_policy.ssm_parameters
}

moved {
  from = aws_iam_role_policy.dist_bucket
  to   = module.ec2[0].aws_iam_role_policy.dist_bucket
}

moved {
  from = aws_iam_role_policy_attachment.xray_tracing
  to   = module.ec2[0].aws_iam_role_policy_attachment.xray_tracing
}

moved {
  from = aws_iam_role_policy.describe_tags
  to   = module.ec2[0].aws_iam_role_policy.describe_tags
}

moved {
  from = aws_iam_role_policy.create_tag
  to   = module.ec2[0].aws_iam_role_policy.create_tag
}

moved {
  from = aws_iam_role_policy_attachment.managed_policies
  to   = module.ec2[0].aws_iam_role_policy_attachment.managed_policies
}

moved {
  from = aws_iam_role_policy.ec2
  to   = module.ec2[0].aws_iam_role_policy.ec2
}

moved {
  from = aws_iam_policy.ami_id_ssm_parameter_read
  to   = module.ec2[0].aws_iam_policy.ami_id_ssm_parameter_read
}
