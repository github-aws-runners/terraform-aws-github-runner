data "aws_iam_policy_document" "scale_down_common" {
  statement {
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = [
      var.config.github.app_parameters.key_base64.arn,
      var.config.github.app_parameters.id.arn,
    ]
  }

  dynamic "statement" {
    for_each = var.config.ssm.kms_key == null ? [] : [var.config.ssm.kms_key]

    content {
      effect    = "Allow"
      actions   = ["kms:Decrypt"]
      resources = [statement.value.arn]
    }
  }
}

data "aws_iam_policy_document" "scale_down" {
  source_policy_documents = [
    data.aws_iam_policy_document.scale_down_common.json,
    var.runner_provider.scale_down.iam_policy_json,
  ]
}

data "aws_iam_policy_document" "scale_down_logging" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.scale_down.arn}*"]
  }
}
