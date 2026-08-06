def expected_previous_addresses:
  [
    "aws_ssm_parameter.runner_ami_id[0]",
    "aws_launch_template.runner",
    "aws_security_group.runner_sg[0]",
    "aws_ssm_parameter.runner_config_run_as",
    "aws_ssm_parameter.runner_enable_cloudwatch",
    "aws_ssm_parameter.cloudwatch_agent_config_runner[0]",
    "aws_cloudwatch_log_group.gh_runners[0]",
    "aws_cloudwatch_log_group.gh_runners[1]",
    "aws_cloudwatch_log_group.gh_runners[2]",
    "aws_cloudwatch_log_group.gh_runners[3]",
    "aws_iam_role_policy.cloudwatch[0]",
    "aws_iam_role.runner[0]",
    "aws_iam_instance_profile.runner[0]",
    "aws_iam_role_policy.runner_session_manager_aws_managed[0]",
    "aws_iam_role_policy.ssm_parameters[0]",
    "aws_iam_role_policy.dist_bucket[0]",
    "aws_iam_role_policy_attachment.xray_tracing[0]",
    "aws_iam_role_policy.describe_tags[0]",
    "aws_iam_role_policy.create_tag[0]",
    "aws_iam_role_policy_attachment.managed_policies[0]",
    "aws_iam_role_policy.ec2[0]",
    "aws_iam_policy.ami_id_ssm_parameter_read[0]"
  ];

[
  .[]
  | select(.type == "test_plan")
  | select(."@testrun" | startswith("plan_provider_split_"))
] as $plans
| if ($plans | length) != 2 then
    error("expected two provider-split upgrade plans, found \($plans | length)")
  else
    [
      $plans[]
      | .test_plan.resource_changes[]?
      | select(.previous_address != null)
    ] as $moved
    | ($moved | map(.previous_address) | unique) as $actual_previous_addresses
    | (expected_previous_addresses - $actual_previous_addresses) as $missing
    | [
        $moved[]
        | select(
            (.change.actions | index("create")) != null
            or (.change.actions | index("delete")) != null
          )
        | {
            address,
            previous_address,
            actions: .change.actions
          }
      ] as $destructive
    | if ($missing | length) != 0 then
        error("upgrade plans did not exercise moved state for: \($missing | join(", "))")
      elif ($destructive | length) != 0 then
        error("moved resources contain create/delete actions: \($destructive | tojson)")
      else
        true
      end
  end
