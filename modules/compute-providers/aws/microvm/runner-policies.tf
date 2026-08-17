data "aws_caller_identity" "current" {}

locals {
  ssm_parameter_arn_prefix = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter"
  runner_token_path_arn    = "${local.ssm_parameter_arn_prefix}${var.ssm.paths.root}/${var.ssm.paths.tokens}/*"

  runtime_log_group_name = try(var.config.logging.log_group, null) == null ? "/aws/lambda/microvms/*" : var.config.logging.log_group
  runtime_log_group_arn  = "arn:${var.aws_partition}:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:${local.runtime_log_group_name}"

  runner_inline_policies = {
    ssm_jit = {
      name        = "runner-microvm-ssm-jit"
      policy_json = data.aws_iam_policy_document.runner_ssm_jit.json
    }
    runtime_logs = {
      name        = "runner-microvm-runtime-logs"
      policy_json = data.aws_iam_policy_document.runner_runtime_logs.json
    }
  }
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

data "aws_iam_policy_document" "runner_runtime_logs" {
  statement {
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup"]
    resources = [local.runtime_log_group_arn]
  }

  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${local.runtime_log_group_arn}:*"]
  }
}
