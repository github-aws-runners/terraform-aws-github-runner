# IAM policies attached to the pool Lambda role.
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

    resources = concat(
      [for p in var.config.github_app_parameters.id : p.arn],
      [for p in var.config.github_app_parameters.key_base64 : p.arn],
      [for p in var.config.github_app_parameters.installation_id : p.arn if p != null],
    )
  }

  dynamic "statement" {
    for_each = var.config.kms_key == null ? [] : [var.config.kms_key]

    content {
      effect = "Allow"

      actions   = ["kms:Decrypt"]
      resources = [statement.value.arn]
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
