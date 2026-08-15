data "aws_iam_policy_document" "deny_insecure_transport_build" {
  for_each = local.webhook_runner_config

  statement {
    sid = "DenyInsecureTransport"

    effect = "Deny"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions = [
      "sqs:*"
    ]

    resources = [aws_sqs_queue.queued_builds[each.key].arn]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sqs_queue" "queued_builds" {
  for_each                   = local.webhook_runner_config
  name                       = "${var.prefix}-${each.key}-queued-builds"
  delay_seconds              = each.value.orchestration.webhook.queue.delay_webhook_event
  visibility_timeout_seconds = each.value.orchestration.webhook.queue.visibility_timeout_seconds
  message_retention_seconds  = each.value.orchestration.webhook.queue.job_queue_retention_in_seconds
  receive_wait_time_seconds  = 0
  redrive_policy = each.value.orchestration.webhook.queue.redrive_build_queue.enabled ? jsonencode({
    deadLetterTargetArn = aws_sqs_queue.queued_builds_dlq[each.key].arn,
    maxReceiveCount     = each.value.orchestration.webhook.queue.redrive_build_queue.maxReceiveCount
  }) : null

  sqs_managed_sse_enabled           = local.translated_experimental.orchestration.webhook.queue.encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = local.translated_experimental.orchestration.webhook.queue.encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = local.translated_experimental.orchestration.webhook.queue.encryption.kms_data_key_reuse_period_seconds

  tags = merge(
    local.translated_experimental.tags,
    each.value.tags,
    each.value.orchestration.webhook.queue.tags,
  )
}
resource "aws_sqs_queue_policy" "build_queue_policy" {
  for_each  = local.webhook_runner_config
  queue_url = aws_sqs_queue.queued_builds[each.key].id
  policy    = data.aws_iam_policy_document.deny_insecure_transport_build[each.key].json
}

resource "aws_sqs_queue" "queued_builds_dlq" {
  for_each = { for config, values in local.webhook_runner_config : config => values if values.orchestration.webhook.queue.redrive_build_queue.enabled }
  name     = "${var.prefix}-${each.key}-queued-builds_dead_letter"

  sqs_managed_sse_enabled           = local.translated_experimental.orchestration.webhook.queue.encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = local.translated_experimental.orchestration.webhook.queue.encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = local.translated_experimental.orchestration.webhook.queue.encryption.kms_data_key_reuse_period_seconds
  tags = merge(
    local.translated_experimental.tags,
    each.value.tags,
    each.value.orchestration.webhook.queue.tags,
  )
}

data "aws_iam_policy_document" "deny_insecure_transport_build_dlq" {
  for_each = { for config, values in local.webhook_runner_config : config => values if values.orchestration.webhook.queue.redrive_build_queue.enabled }

  statement {
    sid = "DenyInsecureTransport"

    effect = "Deny"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions = [
      "sqs:*"
    ]

    resources = [aws_sqs_queue.queued_builds_dlq[each.key].arn]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sqs_queue_policy" "build_queue_dlq_policy" {
  for_each  = { for config, values in local.webhook_runner_config : config => values if values.orchestration.webhook.queue.redrive_build_queue.enabled }
  queue_url = aws_sqs_queue.queued_builds_dlq[each.key].id
  policy    = data.aws_iam_policy_document.deny_insecure_transport_build_dlq[each.key].json
}
