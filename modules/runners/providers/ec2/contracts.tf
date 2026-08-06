resource "aws_iam_policy" "ami_id_ssm_parameter_read" {
  count       = local.ami_id_ssm_parameter_name != null ? 1 : 0
  name        = "${var.prefix}-ami-id-ssm-parameter-read"
  path        = local.role_path
  description = "Allows for reading ${var.prefix} GitHub runner AMI ID from an SSM parameter"
  tags        = local.tags
  policy      = <<-JSON
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "ssm:GetParameter"
          ],
          "Resource": [
            "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${trimprefix(local.ami_id_ssm_parameter_name, "/")}"
          ]
        }
      ]
    }
  JSON
}

locals {
  scale_up_environment_variables = {
    AMI_ID_SSM_PARAMETER_NAME            = local.ami_id_ssm_parameter_name
    INSTANCE_ALLOCATION_STRATEGY         = var.instance_allocation_strategy
    INSTANCE_MAX_SPOT_PRICE              = var.instance_max_spot_price
    INSTANCE_TARGET_CAPACITY_TYPE        = var.instance_target_capacity_type
    INSTANCE_TYPE_PRIORITIES             = var.instance_type_priorities != null ? jsonencode(var.instance_type_priorities) : ""
    INSTANCE_TYPES                       = join(",", var.instance_types)
    LAUNCH_TEMPLATE_NAME                 = aws_launch_template.runner.name
    SUBNET_IDS                           = join(",", var.subnet_ids)
    ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS = jsonencode(var.enable_on_demand_failover_for_errors)
    SCALE_ERRORS                         = jsonencode(var.scale_errors)
    USE_DEDICATED_HOST                   = var.use_dedicated_host
  }

  scale_down_environment_variables = {
    RUNNER_BOOT_TIME_IN_MINUTES = var.runner_boot_time_in_minutes
  }

  pool_environment_variables = merge(local.scale_up_environment_variables, {
    RUNNER_BOOT_TIME_IN_MINUTES = var.runner_boot_time_in_minutes
  })

  runner_role_arn = var.iam_overrides["override_runner_role"] ? var.iam_overrides["runner_role_arn"] : aws_iam_role.runner[0].arn

  scale_up_iam_policy_json = templatefile("${path.module}/policies/lambda-scale-up.json", {
    arn_runner_instance_role = local.runner_role_arn
    environment              = var.prefix
    ami_kms_key_arn          = local.ami_kms_key_arn
    ssm_ami_id_parameter_arn = local.ami_id_ssm_module_managed ? aws_ssm_parameter.runner_ami_id[0].arn : var.ami.id_ssm_parameter_arn
  })

  scale_down_iam_policy_json = templatefile("${path.module}/policies/lambda-scale-down.json", {
    environment = var.prefix
  })

  pool_iam_policy_json = templatefile("${path.module}/policies/lambda-pool.json", {
    arn_runner_instance_role = local.runner_role_arn
    ami_kms_key_arn          = local.ami_kms_key_arn
    ssm_ami_id_parameter_arn = local.ami_id_ssm_module_managed ? aws_ssm_parameter.runner_ami_id[0].arn : var.ami.id_ssm_parameter_arn
  })

  service_linked_role_policy_json = var.create_service_linked_role_spot ? templatefile("${path.module}/policies/service-linked-role-create-policy.json", {
    aws_partition = var.aws_partition
  }) : null
}
