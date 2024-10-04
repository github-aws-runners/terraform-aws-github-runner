
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
  for_each                    = var.multi_runner_config
  name                        = "${var.prefix}-${each.key}-queued-builds${each.value.fifo ? ".fifo" : ""}"
  delay_seconds               = each.value.runner_config.delay_webhook_event
  visibility_timeout_seconds  = var.runners_scale_up_lambda_timeout
  message_retention_seconds   = each.value.runner_config.job_queue_retention_in_seconds
  fifo_queue                  = each.value.fifo
  receive_wait_time_seconds   = 0
  content_based_deduplication = each.value.fifo
  redrive_policy = each.value.redrive_build_queue.enabled ? jsonencode({
    deadLetterTargetArn = aws_sqs_queue.queued_builds_dlq[each.key].arn,
    maxReceiveCount     = each.value.redrive_build_queue.maxReceiveCount
  }) : null

  sqs_managed_sse_enabled           = var.queue_encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = var.queue_encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = var.queue_encryption.kms_data_key_reuse_period_seconds

  tags = var.tags
}

resource "aws_sqs_queue_policy" "build_queue_policy" {
  for_each  = var.multi_runner_config
  queue_url = aws_sqs_queue.queued_builds[each.key].id
  policy    = data.aws_iam_policy_document.deny_unsecure_transport.json
}

resource "aws_sqs_queue" "queued_builds_dlq" {
  for_each = { for config, values in var.multi_runner_config : config => values if values.redrive_build_queue.enabled }
  name     = "${var.prefix}-${each.key}-queued-builds_dead_letter${each.value.fifo ? ".fifo" : ""}"

  sqs_managed_sse_enabled           = var.queue_encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = var.queue_encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = var.queue_encryption.kms_data_key_reuse_period_seconds
  fifo_queue                        = each.value.fifo
  tags                              = var.tags
}

resource "aws_sqs_queue_policy" "build_queue_dlq_policy" {
  for_each  = { for config, values in var.multi_runner_config : config => values if values.redrive_build_queue.enabled }
  queue_url = aws_sqs_queue.queued_builds_dlq[each.key].id
  policy    = data.aws_iam_policy_document.deny_unsecure_transport.json
}

resource "aws_sqs_queue_policy" "webhook_events_workflow_job_queue_policy" {
  count     = var.enable_workflow_job_events_queue ? 1 : 0
  queue_url = aws_sqs_queue.webhook_events_workflow_job_queue[0].id
  policy    = data.aws_iam_policy_document.deny_unsecure_transport.json
}

resource "aws_sqs_queue" "webhook_events_workflow_job_queue" {
  count                       = var.enable_workflow_job_events_queue ? 1 : 0
  name                        = "${var.prefix}-webhook_events_workflow_job_queue"
  delay_seconds               = var.workflow_job_queue_configuration.delay_seconds
  visibility_timeout_seconds  = var.workflow_job_queue_configuration.visibility_timeout_seconds
  message_retention_seconds   = var.workflow_job_queue_configuration.message_retention_seconds
  fifo_queue                  = false
  receive_wait_time_seconds   = 0
  content_based_deduplication = false
  redrive_policy              = null

  sqs_managed_sse_enabled           = var.queue_encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = var.queue_encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = var.queue_encryption.kms_data_key_reuse_period_seconds

  tags = var.tags
}

