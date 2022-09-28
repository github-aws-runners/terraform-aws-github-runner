
locals {
  queues_by_runner_os = tolist([for index, queue in var.sqs_build_queue_by_runner_os : merge(aws_sqs_queue.queued_builds[index], queue)])
  unique_os_types = distinct([for index, config in local.queues_by_runner_os : { "os_type": config["os_config"]["runner_os_type"], "architecture": config["os_config"]["runner_architecture"] } if config["enable_runner_binaries_syncer"]])
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
  count                       = length(var.sqs_build_queue_by_runner_os)
  name                        = "${var.prefix}-${var.sqs_build_queue_by_runner_os[count.index]["os_config"]["runner_os_type"]}-${var.sqs_build_queue_by_runner_os[count.index]["os_config"]["runner_os_distribution"]}-${var.sqs_build_queue_by_runner_os[count.index]["os_config"]["runner_architecture"]}queued-builds${var.sqs_build_queue_by_runner_os[count.index]["fifo"] ? ".fifo" : ""}"
  delay_seconds               = var.delay_webhook_event
  visibility_timeout_seconds  = var.runners_scale_up_lambda_timeout
  message_retention_seconds   = var.job_queue_retention_in_seconds
  fifo_queue                  = var.sqs_build_queue_by_runner_os[count.index]["fifo"]
  receive_wait_time_seconds   = 0
  content_based_deduplication = var.sqs_build_queue_by_runner_os[count.index]["fifo"]
  redrive_policy = var.sqs_build_queue_by_runner_os[count.index]["redrive_build_queue"]["enabled"] ? jsonencode({
    deadLetterTargetArn = aws_sqs_queue.queued_builds_dlq[0].arn,
    maxReceiveCount     = var.sqs_build_queue_by_runner_os[count.index]["redrive_build_queue"]["maxReceiveCount"]
  }) : null

  sqs_managed_sse_enabled           = var.queue_encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = var.queue_encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = var.queue_encryption.kms_data_key_reuse_period_seconds

  tags = var.tags
}

resource "aws_sqs_queue_policy" "build_queue_policy" {
  count  = length(aws_sqs_queue.queued_builds)
  queue_url = aws_sqs_queue.queued_builds[count.index]["id"]
  policy    = data.aws_iam_policy_document.deny_unsecure_transport.json
}

resource "aws_sqs_queue" "queued_builds_dlq" {
  count    = length(var.sqs_build_queue_by_runner_os)
  name     = "${var.prefix}-${var.sqs_build_queue_by_runner_os[count.index]["os_config"]["runner_os_type"]}-${var.sqs_build_queue_by_runner_os[count.index]["os_config"]["runner_os_distribution"]}-queued-builds_dead_letter"

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
