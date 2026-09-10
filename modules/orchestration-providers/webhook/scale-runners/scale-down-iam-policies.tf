data "aws_iam_policy_document" "scale_down_common" {
  statement {
    sid    = "WebhookScaleDownReadGitHubAppParameters"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = concat(
      [for p in var.config.github.app_parameters.id : p.arn],
      [for p in var.config.github.app_parameters.key_base64 : p.arn],
      [for p in var.config.github.app_parameters.installation_id : p.arn if p != null],
    )
  }

  dynamic "statement" {
    for_each = var.config.ssm.kms_key_id == null ? [] : [var.config.ssm.kms_key_id]
    iterator = kms_key

    content {
      sid       = "WebhookScaleDownDecryptParameterStore"
      effect    = "Allow"
      actions   = ["kms:Decrypt"]
      resources = [kms_key.value]
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
    sid    = "WebhookScaleDownWriteLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.scale_down.arn}*"]
  }
}
