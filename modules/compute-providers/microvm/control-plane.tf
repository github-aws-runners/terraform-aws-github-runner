data "aws_iam_policy_document" "scale_up" {
  statement {
    effect    = "Allow"
    actions   = local.scale_up_actions
    resources = var.config.iam.resource_arns
  }

  statement {
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [local.execution_role_arn]
  }
}

data "aws_iam_policy_document" "scale_down" {
  statement {
    effect    = "Allow"
    actions   = local.scale_down_actions
    resources = var.config.iam.resource_arns
  }
}

locals {
  default_scale_up_actions = [
    "lambdamicrovms:CreateMicrovmAuthToken",
    "lambdamicrovms:GetMicrovm",
    "lambdamicrovms:ListMicrovms",
    "lambdamicrovms:RunMicrovm",
    "lambdamicrovms:TagResource",
  ]

  default_scale_down_actions = [
    "lambdamicrovms:GetMicrovm",
    "lambdamicrovms:ListMicrovms",
    "lambdamicrovms:ListTags",
    "lambdamicrovms:TagResource",
    "lambdamicrovms:TerminateMicrovm",
    "lambdamicrovms:UntagResource",
  ]

  scale_up_actions   = coalesce(var.config.iam.actions.scale_up, local.default_scale_up_actions)
  scale_down_actions = coalesce(var.config.iam.actions.scale_down, local.default_scale_down_actions)

  execution_role_arn = coalesce(try(var.config.execution_role.arn, null), var.runner.iam.role.arn)

  microvm_tags = merge(
    var.tags,
    var.config.tags,
    {
      "ghr:Application"        = "github-action-runner"
      "ghr:environment"        = var.prefix
      "ghr:runner_name_prefix" = var.runner.name_prefix
    },
  )

  microvm_idle_policy = var.config.idle_policy == null ? null : {
    maxIdleDurationSeconds   = var.config.idle_policy.max_idle_duration_seconds
    suspendedDurationSeconds = var.config.idle_policy.suspended_duration_seconds
    autoResumeEnabled        = var.config.idle_policy.auto_resume_enabled
  }

  microvm_logging = var.config.logging == null ? null : (
    var.config.logging.disabled ? {
      disabled = {}
      } : {
      cloudWatch = {
        logGroup  = try(var.config.logging.cloud_watch.log_group, null)
        logStream = try(var.config.logging.cloud_watch.log_stream, null)
      }
    }
  )

  microvm_run_config = {
    imageIdentifier          = var.config.image_identifier
    imageVersion             = var.config.image_version
    executionRoleArn         = local.execution_role_arn
    egressNetworkConnectors  = var.config.egress_network_connectors
    idlePolicy               = local.microvm_idle_policy
    logging                  = local.microvm_logging
    runHookPayload           = var.config.run_hook_payload
    maximumDurationInSeconds = var.config.maximum_duration_in_seconds
    tags                     = local.microvm_tags
  }

  create_environment_variables = merge(var.config.environment_variables, {
    MICROVM_AWS_PARTITION             = var.aws_partition
    MICROVM_AWS_REGION                = var.aws_region
    MICROVM_EGRESS_NETWORK_CONNECTORS = jsonencode(var.config.egress_network_connectors)
    MICROVM_EXECUTION_ROLE_ARN        = local.execution_role_arn
    MICROVM_IMAGE_IDENTIFIER          = var.config.image_identifier
    MICROVM_IMAGE_VERSION             = var.config.image_version == null ? "" : var.config.image_version
    MICROVM_RUN_CONFIG                = jsonencode(local.microvm_run_config)
    MICROVM_TAGS                      = jsonencode(local.microvm_tags)
  })

  scale_up_environment_variables = local.create_environment_variables

  scale_down_environment_variables = merge(var.config.environment_variables, {
    MICROVM_AWS_PARTITION       = var.aws_partition
    MICROVM_AWS_REGION          = var.aws_region
    MICROVM_IMAGE_IDENTIFIER    = var.config.image_identifier
    MICROVM_IMAGE_VERSION       = var.config.image_version == null ? "" : var.config.image_version
    MICROVM_TAGS                = jsonencode(local.microvm_tags)
    RUNNER_BOOT_TIME_IN_MINUTES = var.runner.boot_time_in_minutes
  })

  pool_environment_variables = merge(local.create_environment_variables, {
    RUNNER_BOOT_TIME_IN_MINUTES = var.runner.boot_time_in_minutes
  })
}
