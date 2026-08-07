# IAM policies attached to the scale-up Lambda role.
data "aws_iam_policy_document" "scale_up_common" {
  statement {
    effect = "Allow"
    actions = [
      "ssm:PutParameter",
      "ssm:AddTagsToResource",
    ]
    resources = ["*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = [
      var.github.app_parameters.key_base64.arn,
      var.github.app_parameters.id.arn,
      "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm.paths.root}/${var.ssm.paths.config}/*",
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:GetQueueAttributes",
      "sqs:DeleteMessage",
    ]
    resources = [var.queue.build.arn]
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

data "aws_iam_policy_document" "scale_up" {
  source_policy_documents = [
    data.aws_iam_policy_document.scale_up_common.json,
    local.provider.scale_up.iam_policy_json,
  ]
}

data "aws_iam_policy_document" "scale_up_logging" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.scale_up.arn}*"]
  }
}

data "aws_iam_policy_document" "scale_up_job_retry_publish" {
  count = local.job_retry_enabled ? 1 : 0

  statement {
    effect = "Allow"
    actions = [
      "sqs:SendMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [module.job_retry[0].job_retry_check_queue.arn]
  }
}
