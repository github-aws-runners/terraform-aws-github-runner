output "moved_resource_ids" {
  value = {
    runner_ami_id                     = try(aws_ssm_parameter.runner_ami_id[0].id, null)
    launch_template                   = aws_launch_template.runner.id
    security_group                    = aws_security_group.runner_sg[0].id
    runner_config_run_as              = aws_ssm_parameter.runner_config_run_as.id
    runner_enable_cloudwatch          = aws_ssm_parameter.runner_enable_cloudwatch.id
    cloudwatch_agent_config_runner    = aws_ssm_parameter.cloudwatch_agent_config_runner[0].id
    runner_log_groups                 = aws_cloudwatch_log_group.gh_runners[*].id
    cloudwatch_policy                 = aws_iam_role_policy.cloudwatch[0].id
    runner_role                       = aws_iam_role.runner[0].id
    runner_instance_profile           = aws_iam_instance_profile.runner[0].id
    runner_session_manager_policy     = aws_iam_role_policy.runner_session_manager_aws_managed[0].id
    runner_ssm_parameters_policy      = aws_iam_role_policy.ssm_parameters[0].id
    runner_distribution_bucket_policy = aws_iam_role_policy.dist_bucket[0].id
    runner_xray_attachment            = aws_iam_role_policy_attachment.xray_tracing[0].id
    runner_describe_tags_policy       = aws_iam_role_policy.describe_tags[0].id
    runner_create_tag_policy          = aws_iam_role_policy.create_tag[0].id
    runner_managed_policy_attachment  = aws_iam_role_policy_attachment.managed_policies[0].id
    runner_ec2_policy                 = aws_iam_role_policy.ec2[0].id
    ami_parameter_read_policy         = try(aws_iam_policy.ami_id_ssm_parameter_read[0].id, null)
  }
}
