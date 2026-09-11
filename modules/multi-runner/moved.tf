# Preserve v1 runner state when a multi-runner configuration is migrated to
# the v2 runner-config/provider topology. The module calls use unindexed
# addresses intentionally so Terraform carries each for_each instance key
# from module.runners to the corresponding module.runner_configs instance.

# Common runner configuration resources.
moved {
  from = module.runners.aws_iam_role.runner
  to   = module.runner_configs.aws_iam_role.runner
}

moved {
  from = module.runners.aws_ssm_parameter.runner_agent_mode
  to   = module.runner_configs.aws_ssm_parameter.runner_agent_mode
}

moved {
  from = module.runners.aws_ssm_parameter.disable_default_labels
  to   = module.runner_configs.aws_ssm_parameter.disable_default_labels
}

moved {
  from = module.runners.aws_ssm_parameter.jit_config_enabled
  to   = module.runner_configs.aws_ssm_parameter.jit_config_enabled
}

moved {
  from = module.runners.aws_ssm_parameter.token_path
  to   = module.runner_configs.aws_ssm_parameter.token_path
}

# EC2 compute-provider resources.
moved {
  from = module.runners.aws_iam_policy.ami_id_ssm_parameter_read
  to   = module.runner_configs.module.compute_aws_ec2[0].aws_iam_policy.ami_id_ssm_parameter_read
}

moved {
  from = module.runners.aws_iam_instance_profile.runner
  to   = module.runner_configs.module.compute_aws_ec2[0].aws_iam_instance_profile.runner
}

moved {
  from = module.runners.aws_ssm_parameter.cloudwatch_agent_config_runner
  to   = module.runner_configs.module.compute_aws_ec2[0].aws_ssm_parameter.cloudwatch_agent_config_runner
}

moved {
  from = module.runners.aws_cloudwatch_log_group.gh_runners
  to   = module.runner_configs.module.compute_aws_ec2[0].aws_cloudwatch_log_group.gh_runners
}

moved {
  from = module.runners.aws_iam_role_policy.cloudwatch[0]
  to   = module.runner_configs.aws_iam_role_policy.runner_provider["cloudwatch"]
}

moved {
  from = module.runners.aws_ssm_parameter.runner_ami_id
  to   = module.runner_configs.module.compute_aws_ec2[0].aws_ssm_parameter.runner_ami_id
}

moved {
  from = module.runners.aws_launch_template.runner
  to   = module.runner_configs.module.compute_aws_ec2[0].aws_launch_template.runner
}

moved {
  from = module.runners.aws_security_group.runner_sg
  to   = module.runner_configs.module.compute_aws_ec2[0].aws_security_group.runner_sg
}

moved {
  from = module.runners.aws_ssm_parameter.runner_config_run_as
  to   = module.runner_configs.module.compute_aws_ec2[0].aws_ssm_parameter.runner_config_run_as
}

moved {
  from = module.runners.aws_ssm_parameter.runner_enable_cloudwatch
  to   = module.runner_configs.module.compute_aws_ec2[0].aws_ssm_parameter.runner_enable_cloudwatch
}

# Runner-role policies are now returned by the compute provider and attached
# by runner-config. These fixed keys correspond to the translated v1 policy
# names; user-supplied managed-policy lists remain a dynamic collection and
# cannot be safely re-keyed by a static moved block.
moved {
  from = module.runners.aws_iam_role_policy.runner_session_manager_aws_managed[0]
  to   = module.runner_configs.aws_iam_role_policy.runner_provider["session_manager"]
}

moved {
  from = module.runners.aws_iam_role_policy.ssm_parameters[0]
  to   = module.runner_configs.aws_iam_role_policy.runner_provider["ssm_parameters"]
}

moved {
  from = module.runners.aws_iam_role_policy.dist_bucket[0]
  to   = module.runner_configs.aws_iam_role_policy.runner_provider["distribution_bucket"]
}

moved {
  from = module.runners.aws_iam_role_policy.describe_tags[0]
  to   = module.runner_configs.aws_iam_role_policy.runner_provider["describe_tags"]
}

moved {
  from = module.runners.aws_iam_role_policy.create_tag[0]
  to   = module.runner_configs.aws_iam_role_policy.runner_provider["create_tags"]
}

moved {
  from = module.runners.aws_iam_role_policy.ec2[0]
  to   = module.runner_configs.aws_iam_role_policy.runner_provider["terminate_self"]
}

moved {
  from = module.runners.aws_iam_role_policy_attachment.xray_tracing[0]
  to   = module.runner_configs.aws_iam_role_policy_attachment.runner["xray"]
}

# Pool resources moved below the webhook orchestration boundary. The provider
# attachment replaces the v1 AMI-policy attachment at the same AWS role.
moved {
  from = module.runners.module.pool.aws_lambda_function.pool
  to   = module.runner_configs.module.orchestration_webhook[0].module.pool.aws_lambda_function.pool
}

moved {
  from = module.runners.module.pool.aws_cloudwatch_log_group.pool
  to   = module.runner_configs.module.orchestration_webhook[0].module.pool.aws_cloudwatch_log_group.pool
}

moved {
  from = module.runners.module.pool.aws_iam_role.pool
  to   = module.runner_configs.module.orchestration_webhook[0].module.pool.aws_iam_role.pool
}

moved {
  from = module.runners.module.pool.aws_iam_role_policy.pool
  to   = module.runner_configs.module.orchestration_webhook[0].module.pool.aws_iam_role_policy.pool
}

moved {
  from = module.runners.module.pool.aws_iam_role_policy.pool_logging
  to   = module.runner_configs.module.orchestration_webhook[0].module.pool.aws_iam_role_policy.pool_logging
}

moved {
  from = module.runners.module.pool.aws_iam_role_policy_attachment.pool_vpc_execution_role
  to   = module.runner_configs.module.orchestration_webhook[0].module.pool.aws_iam_role_policy_attachment.pool_vpc_execution_role
}

moved {
  from = module.runners.module.pool.aws_iam_role_policy_attachment.ami_id_ssm_parameter_read
  to   = module.runner_configs.module.orchestration_webhook[0].module.pool.aws_iam_role_policy_attachment.provider
}

moved {
  from = module.runners.module.pool.aws_iam_role_policy.pool_xray
  to   = module.runner_configs.module.orchestration_webhook[0].module.pool.aws_iam_role_policy.pool_xray
}

moved {
  from = module.runners.module.pool.aws_scheduler_schedule_group.pool
  to   = module.runner_configs.module.orchestration_webhook[0].module.pool.aws_scheduler_schedule_group.pool
}

moved {
  from = module.runners.module.pool.aws_iam_role.scheduler
  to   = module.runner_configs.module.orchestration_webhook[0].module.pool.aws_iam_role.scheduler
}

moved {
  from = module.runners.module.pool.aws_iam_role_policy.scheduler
  to   = module.runner_configs.module.orchestration_webhook[0].module.pool.aws_iam_role_policy.scheduler
}

moved {
  from = module.runners.module.pool.aws_scheduler_schedule.pool
  to   = module.runner_configs.module.orchestration_webhook[0].module.pool.aws_scheduler_schedule.pool
}

# Webhook scale-up and scale-down resources.
moved {
  from = module.runners.aws_lambda_function.scale_up
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_lambda_function.scale_up
}

moved {
  from = module.runners.aws_cloudwatch_log_group.scale_up
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_cloudwatch_log_group.scale_up
}

moved {
  from = module.runners.aws_lambda_event_source_mapping.scale_up
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_lambda_event_source_mapping.scale_up
}

moved {
  from = module.runners.aws_lambda_permission.scale_runners_lambda
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_lambda_permission.scale_runners_lambda
}

moved {
  from = module.runners.aws_iam_role.scale_up
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role.scale_up
}

moved {
  from = module.runners.aws_iam_role_policy.scale_up
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.scale_up
}

moved {
  from = module.runners.aws_iam_role_policy.scale_up_logging
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.scale_up_logging
}

moved {
  from = module.runners.aws_iam_role_policy.service_linked_role
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.service_linked_role
}

moved {
  from = module.runners.aws_iam_role_policy_attachment.scale_up_vpc_execution_role
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy_attachment.scale_up_vpc_execution_role
}

moved {
  from = module.runners.aws_iam_role_policy_attachment.ami_id_ssm_parameter_read
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy_attachment.provider
}

moved {
  from = module.runners.aws_iam_role_policy.scale_up_xray
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.scale_up_xray
}

moved {
  from = module.runners.aws_iam_role_policy.job_retry_sqs_publish
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.job_retry_sqs_publish
}

moved {
  from = module.runners.aws_lambda_function.scale_down
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_lambda_function.scale_down
}

moved {
  from = module.runners.aws_cloudwatch_log_group.scale_down
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_cloudwatch_log_group.scale_down
}

moved {
  from = module.runners.aws_cloudwatch_event_rule.scale_down
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_cloudwatch_event_rule.scale_down
}

moved {
  from = module.runners.aws_cloudwatch_event_target.scale_down
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_cloudwatch_event_target.scale_down
}

moved {
  from = module.runners.aws_lambda_permission.scale_down
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_lambda_permission.scale_down
}

moved {
  from = module.runners.aws_iam_role.scale_down
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role.scale_down
}

moved {
  from = module.runners.aws_iam_role_policy.scale_down
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.scale_down
}

moved {
  from = module.runners.aws_iam_role_policy.scale_down_logging
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.scale_down_logging
}

moved {
  from = module.runners.aws_iam_role_policy_attachment.scale_down_vpc_execution_role
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy_attachment.scale_down_vpc_execution_role
}

moved {
  from = module.runners.aws_iam_role_policy.scale_down_xray
  to   = module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.scale_down_xray
}

# Job-retry resources moved below the webhook orchestration boundary. The v1
# Lambda leaf module was flattened into the v2 job-retry module, so its child
# resource addresses are moved explicitly.
moved {
  from = module.runners.module.job_retry.aws_sqs_queue_policy.job_retry_check_queue_policy
  to   = module.runner_configs.module.orchestration_webhook[0].module.job_retry.aws_sqs_queue_policy.job_retry_check_queue_policy
}

moved {
  from = module.runners.module.job_retry.aws_sqs_queue.job_retry_check_queue
  to   = module.runner_configs.module.orchestration_webhook[0].module.job_retry.aws_sqs_queue.job_retry_check_queue
}

moved {
  from = module.runners.module.job_retry.module.job_retry.aws_lambda_function.main
  to   = module.runner_configs.module.orchestration_webhook[0].module.job_retry.aws_lambda_function.job_retry
}

moved {
  from = module.runners.module.job_retry.module.job_retry.aws_cloudwatch_log_group.main
  to   = module.runner_configs.module.orchestration_webhook[0].module.job_retry.aws_cloudwatch_log_group.job_retry
}

moved {
  from = module.runners.module.job_retry.module.job_retry.aws_iam_role.main
  to   = module.runner_configs.module.orchestration_webhook[0].module.job_retry.aws_iam_role.job_retry
}

moved {
  from = module.runners.module.job_retry.module.job_retry.aws_iam_role_policy.lambda_logging
  to   = module.runner_configs.module.orchestration_webhook[0].module.job_retry.aws_iam_role_policy.job_retry_logging
}

moved {
  from = module.runners.module.job_retry.module.job_retry.aws_iam_role_policy_attachment.vpc_execution_role
  to   = module.runner_configs.module.orchestration_webhook[0].module.job_retry.aws_iam_role_policy_attachment.job_retry_vpc_execution_role
}

moved {
  from = module.runners.module.job_retry.module.job_retry.aws_iam_role_policy.xray
  to   = module.runner_configs.module.orchestration_webhook[0].module.job_retry.aws_iam_role_policy.job_retry_xray
}

moved {
  from = module.runners.module.job_retry.aws_lambda_event_source_mapping.job_retry
  to   = module.runner_configs.module.orchestration_webhook[0].module.job_retry.aws_lambda_event_source_mapping.job_retry
}

moved {
  from = module.runners.module.job_retry.aws_lambda_permission.job_retry
  to   = module.runner_configs.module.orchestration_webhook[0].module.job_retry.aws_lambda_permission.job_retry
}

moved {
  from = module.runners.module.job_retry.aws_iam_role_policy.job_retry
  to   = module.runner_configs.module.orchestration_webhook[0].module.job_retry.aws_iam_role_policy.job_retry
}

# SSM housekeeper resources now live in the runner-config-owned submodule.
moved {
  from = module.runners.aws_lambda_function.ssm_housekeeper
  to   = module.runner_configs.module.ssm_housekeeper.aws_lambda_function.ssm_housekeeper
}

moved {
  from = module.runners.aws_cloudwatch_log_group.ssm_housekeeper
  to   = module.runner_configs.module.ssm_housekeeper.aws_cloudwatch_log_group.ssm_housekeeper
}

moved {
  from = module.runners.aws_cloudwatch_event_rule.ssm_housekeeper
  to   = module.runner_configs.module.ssm_housekeeper.aws_cloudwatch_event_rule.ssm_housekeeper
}

moved {
  from = module.runners.aws_cloudwatch_event_target.ssm_housekeeper
  to   = module.runner_configs.module.ssm_housekeeper.aws_cloudwatch_event_target.ssm_housekeeper
}

moved {
  from = module.runners.aws_lambda_permission.ssm_housekeeper
  to   = module.runner_configs.module.ssm_housekeeper.aws_lambda_permission.ssm_housekeeper
}

moved {
  from = module.runners.aws_iam_role.ssm_housekeeper
  to   = module.runner_configs.module.ssm_housekeeper.aws_iam_role.ssm_housekeeper
}

moved {
  from = module.runners.aws_iam_role_policy.ssm_housekeeper
  to   = module.runner_configs.module.ssm_housekeeper.aws_iam_role_policy.ssm_housekeeper
}

moved {
  from = module.runners.aws_iam_role_policy.ssm_housekeeper_logging
  to   = module.runner_configs.module.ssm_housekeeper.aws_iam_role_policy.ssm_housekeeper_logging
}

moved {
  from = module.runners.aws_iam_role_policy_attachment.ssm_housekeeper_vpc_execution_role
  to   = module.runner_configs.module.ssm_housekeeper.aws_iam_role_policy_attachment.ssm_housekeeper_vpc_execution_role
}

moved {
  from = module.runners.aws_iam_role_policy.ssm_housekeeper_xray
  to   = module.runner_configs.module.ssm_housekeeper.aws_iam_role_policy.ssm_housekeeper_xray
}
