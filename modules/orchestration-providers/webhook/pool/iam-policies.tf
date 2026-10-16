# IAM policies attached to the pool Lambda role.
data "aws_iam_policy_document" "pool_common" {
  source_policy_documents = [data.aws_iam_policy_document.ssm_pool_common.json]
}

data "aws_iam_policy_document" "pool_logging" {
  statement {
    sid    = "WebhookPoolWriteLogs"
    effect = "Allow"

    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = ["${aws_cloudwatch_log_group.pool.arn}*"]
  }
}
