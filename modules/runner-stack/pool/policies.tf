data "aws_iam_policy_document" "pool_common" {
  statement {
    effect = "Allow"

    actions = [
      "ssm:AddTagsToResource",
      "ssm:PutParameter",
    ]

    resources = ["*"]
  }

  statement {
    effect = "Allow"

    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
    ]

    resources = [
      var.config.arn_ssm_parameters_path_config,
      "${var.config.arn_ssm_parameters_path_config}/*",
    ]
  }

  statement {
    effect = "Allow"

    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]

    resources = [
      var.config.github_app_parameters.key_base64.arn,
      var.config.github_app_parameters.id.arn,
    ]
  }

  dynamic "statement" {
    for_each = var.config.kms_key_arn == "" ? [] : [var.config.kms_key_arn]

    content {
      effect = "Allow"

      actions   = ["kms:Decrypt"]
      resources = [statement.value]
    }
  }
}

data "aws_iam_policy_document" "pool_logging" {
  statement {
    effect = "Allow"

    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = ["${aws_cloudwatch_log_group.pool.arn}*"]
  }
}
