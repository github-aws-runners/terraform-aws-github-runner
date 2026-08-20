data "aws_caller_identity" "current" {}

locals {
  ssm_parameter_arn_prefix = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter"
  runner_token_path_arn    = "${local.ssm_parameter_arn_prefix}${var.ssm.paths.root}/${var.ssm.paths.tokens}/*"

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
      "ssm:ListTagsForResource",
    ]
    resources = [local.runner_token_path_arn]
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
