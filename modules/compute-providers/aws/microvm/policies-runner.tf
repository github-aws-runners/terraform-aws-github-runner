data "aws_caller_identity" "current" {}

locals {
  ssm_parameter_arn_prefix     = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter"
  runner_token_path_arn        = "${local.ssm_parameter_arn_prefix}/${trim(var.ssm.paths.root, "/")}/${trim(var.ssm.paths.tokens, "/")}/*"
  runner_metadata_tags_arn     = "${local.microvm_metadata_path_arn}/*.tags"
  runner_enable_cloudwatch_arn = "${local.ssm_parameter_arn_prefix}${local.ssm_config_ssm_path}/enable_cloudwatch"
  runner_cloudwatch_config_arn = "${local.ssm_parameter_arn_prefix}${local.ssm_config_ssm_path}/cloudwatch_agent_config_runner"
  runner_cloudwatch_log_group_arns = [for name in local.runner_log_group_names :
    "arn:${var.aws_partition}:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:${name}"
  ]
  runner_inline_policies = merge({
    ssm_jit = {
      name        = "runner-microvm-ssm-jit"
      policy_json = data.aws_iam_policy_document.runner_ssm_jit.json
    }
    runtime_logs = {
      name        = "runner-microvm-runtime-logs"
      policy_json = data.aws_iam_policy_document.runner_runtime_logs.json
    }
    runner_metadata = {
      name        = "runner-microvm-metadata"
      policy_json = data.aws_iam_policy_document.runner_metadata.json
    }
    }, var.config.cloudwatch_agent.enabled ? {
    cloudwatch = {
      name        = "runner-microvm-cloudwatch"
      policy_json = data.aws_iam_policy_document.runner_cloudwatch[0].json
    }
  } : {})
}

data "aws_iam_policy_document" "runner_ssm_jit" {
  statement {
    effect = "Allow"
    actions = [
      "ssm:DeleteParameter",
      "ssm:GetParameter",
    ]
    resources = [local.runner_token_path_arn]
  }
}

data "aws_iam_policy_document" "runner_metadata" {
  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [local.runner_metadata_tags_arn, local.runner_enable_cloudwatch_arn]
  }
}

data "aws_iam_policy_document" "runner_cloudwatch" {
  count = var.config.cloudwatch_agent.enabled ? 1 : 0

  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [local.runner_cloudwatch_config_arn]
  }

  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:DescribeLogStreams",
      "logs:PutLogEvents",
    ]
    resources = [for arn in local.runner_cloudwatch_log_group_arns : "${arn}:*"]
  }
}

data "aws_iam_policy_document" "runner_runtime_logs" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.runtime.arn}:*"]
  }
}
