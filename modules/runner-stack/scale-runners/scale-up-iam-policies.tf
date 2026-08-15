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
    resources = concat(
      [for p in var.config.github.app_parameters.id : p.arn],
      [for p in var.config.github.app_parameters.key_base64 : p.arn],
      [for p in var.config.github.app_parameters.installation_id : p.arn if p != null],
      ["${var.config.ssm.config_path_arn}/*"],
    )
  }

  statement {
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:GetQueueAttributes",
      "sqs:DeleteMessage",
    ]
    resources = [var.config.queue.build.arn]
  }

  statement {
    effect  = "Allow"
    actions = ["kms:Decrypt"]
    resources = [coalesce(
      var.config.ssm.kms_key_id,
      "arn:${var.aws_partition}:kms:*:000000000000:key/00000000-0000-0000-0000-000000000000",
    )]
  }
}

data "aws_iam_policy_document" "scale_up" {
  source_policy_documents = [
    data.aws_iam_policy_document.scale_up_common.json,
    var.runner_provider.scale_up.iam_policy_json,
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
  count = var.config.job_retry.enabled ? 1 : 0

  statement {
    effect = "Allow"
    actions = [
      "sqs:SendMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [var.config.job_retry.queue.arn]
  }
}
