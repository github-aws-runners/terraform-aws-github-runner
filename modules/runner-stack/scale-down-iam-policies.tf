# IAM policies attached to the scale-down Lambda role.
data "aws_iam_policy_document" "scale_down_common" {
  statement {
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = [
      var.github.app_parameters.key_base64.arn,
      var.github.app_parameters.id.arn,
    ]
  }

  dynamic "statement" {
    for_each = local.kms_key == null ? [] : [local.kms_key]

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
    local.provider.scale_down.iam_policy_json,
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
