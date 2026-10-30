# extends logging.tf
resource "aws_ssm_parameter" "cloudwatch_agent_config_runner" {
  count = var.storage_provider.aws.ssm != null && var.config.cloudwatch_agent.enabled ? 1 : 0
  name  = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.config}/cloudwatch_agent_config_runner"
  type  = "String"
  value = var.config.cloudwatch_agent.config != null ? var.config.cloudwatch_agent.config : templatefile("${path.module}/templates/cloudwatch_config.json", {
    logfiles = jsonencode(local.logfiles)
  })
  tags = local.ssm_parameter_tags
}

# extends policies-runner.tf
data "aws_iam_policy_document" "ssm_parameters" {
  count = var.storage_provider.aws.ssm != null ? 1 : 0

  statement {
    effect = "Allow"
    actions = [
      "ssm:DeleteParameter",
      "ssm:GetParameters",
      "ssm:GetParameter",
    ]
    resources = [
      "${local.ssm_parameter_arn_prefix}${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.tokens}/*",
    ]

    condition {
      test     = "StringLike"
      variable = "ec2:SourceInstanceARN"
      values   = ["*/&{aws:ResourceTag/InstanceId}"]
    }
  }

  statement {
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
    ]
    resources = [
      local.ssm_config_arn,
      "${local.ssm_config_arn}/*",
    ]
  }
}

data "aws_iam_policy_document" "ssm_cloudwatch" {
  count = var.storage_provider.aws.ssm != null && var.config.cloudwatch_agent.enabled ? 1 : 0

  statement {
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
    ]
    resources = [
      "${aws_ssm_parameter.cloudwatch_agent_config_runner[0].arn}/*",
    ]
  }
}

locals {
  ssm_runner_inline_policies = var.storage_provider.aws.ssm != null ? {
    ssm_parameters = {
      name        = "runner-ssm-parameters"
      policy_json = data.aws_iam_policy_document.ssm_parameters[0].json
    }
    } : {
  }
}

# runner config
locals {
  ssm_root_path            = try(var.storage_provider.aws.ssm.paths.root, null)
  ssm_config_path          = local.ssm_root_path == null ? null : "${local.ssm_root_path}/${var.storage_provider.aws.ssm.paths.config}"
  ssm_parameter_arn_prefix = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter"
  ssm_config_arn           = local.ssm_config_path == null ? null : "${local.ssm_parameter_arn_prefix}${local.ssm_config_path}"

  ssm_parameter_tags = merge(
    local.provider_tags,
    try(var.storage_provider.aws.ssm.tags, {}),
    try(var.storage_provider.aws.ssm.parameters.tags, {}),
  )

  ssm_runner_tags = var.storage_provider.aws.ssm != null ? {
    "ghr:ssm_config_path" = local.ssm_config_path
  } : {}

}

resource "aws_ssm_parameter" "runner_config_run_as" {
  count = var.storage_provider.aws.ssm != null ? 1 : 0
  name  = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.config}/run_as"
  type  = "String"
  value = var.runner.run_as_root ? "root" : var.runner.run_as
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "runner_enable_cloudwatch" {
  count = var.storage_provider.aws.ssm != null ? 1 : 0
  name  = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.config}/enable_cloudwatch"
  type  = "String"
  value = var.config.cloudwatch_agent.enabled
  tags  = local.ssm_parameter_tags
}

moved {
  from = aws_ssm_parameter.runner_config_run_as
  to   = aws_ssm_parameter.runner_config_run_as[0]
}

moved {
  from = aws_ssm_parameter.runner_enable_cloudwatch
  to   = aws_ssm_parameter.runner_enable_cloudwatch[0]
}
