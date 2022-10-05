
locals {
  multi_runner_queues_config = tolist([for index, queue in var.multi_runner_config : merge(aws_sqs_queue.queued_builds[index], queue)])
  unique_os_and_arch         = distinct([for index, config in local.multi_runner_queues_config : { "os_type" : config["runner_config"]["runner_os"], "architecture" : config["runner_config"]["runner_architecture"] } if config["runner_config"]["enable_runner_binaries_syncer"]])
}
data "aws_iam_policy_document" "deny_unsecure_transport" {
  statement {
    sid = "DenyUnsecureTransport"

    effect = "Deny"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions = [
      "sqs:*"
    ]

    resources = [
      "*"
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}


resource "aws_sqs_queue" "queued_builds" {
  count                       = length(var.multi_runner_config)
  name                        = "${var.prefix}-${var.multi_runner_config[count.index]["runner_config"]["id"]}-queued-builds${var.multi_runner_config[count.index]["fifo"] ? ".fifo" : ""}"
  delay_seconds               = var.delay_webhook_event
  visibility_timeout_seconds  = var.runners_scale_up_lambda_timeout
  message_retention_seconds   = var.job_queue_retention_in_seconds
  fifo_queue                  = var.multi_runner_config[count.index]["fifo"]
  receive_wait_time_seconds   = 0
  content_based_deduplication = var.multi_runner_config[count.index]["fifo"]
  redrive_policy = var.multi_runner_config[count.index]["redrive_build_queue"]["enabled"] ? jsonencode({
    deadLetterTargetArn = aws_sqs_queue.queued_builds_dlq[0].arn,
    maxReceiveCount     = var.multi_runner_config[count.index]["redrive_build_queue"]["maxReceiveCount"]
  }) : null

  sqs_managed_sse_enabled           = var.queue_encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = var.queue_encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = var.queue_encryption.kms_data_key_reuse_period_seconds

  tags = var.tags
}

resource "aws_sqs_queue_policy" "build_queue_policy" {
  count     = length(aws_sqs_queue.queued_builds)
  queue_url = aws_sqs_queue.queued_builds[count.index]["id"]
  policy    = data.aws_iam_policy_document.deny_unsecure_transport.json
}

resource "aws_sqs_queue" "queued_builds_dlq" {
  count = length(var.multi_runner_config)
  name  = "${var.prefix}-${var.multi_runner_config[count.index]["runner_config"]["id"]}-queued-builds_dead_letter"

  sqs_managed_sse_enabled           = var.queue_encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = var.queue_encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = var.queue_encryption.kms_data_key_reuse_period_seconds

  tags = var.tags
}

resource "aws_sqs_queue_policy" "build_queue_dlq_policy" {
  count     = length(aws_sqs_queue.queued_builds_dlq)
  queue_url = aws_sqs_queue.queued_builds_dlq[count.index]["id"]
  policy    = data.aws_iam_policy_document.deny_unsecure_transport.json
}
