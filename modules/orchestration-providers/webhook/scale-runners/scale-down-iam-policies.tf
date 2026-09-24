
data "aws_iam_policy_document" "scale_down" {
  source_policy_documents = compact([
    data.aws_iam_policy_document.ssm_scale_down_common.json,
  ])
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
