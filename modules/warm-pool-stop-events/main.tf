# One consumer per deployment marks primed warm pool instances warm from their EC2 stop events.
# EC2 state-change events cannot be filtered by tag, so the consumer resolves each instance's pool itself.
locals {
  packaged_lambda_zip = "${path.module}/../../lambdas/functions/control-plane/runners.zip"
  # Lambda retries a message only after its visibility timeout; six times the timeout is the AWS recommendation.
  visibility_timeout_seconds = 6 * var.config.lambda.timeout
}

resource "aws_cloudwatch_event_rule" "instance_stopped" {
  name        = "${var.config.prefix}-warm-pool-stopped"
  description = "Marks primed warm pool instances available as soon as they stop."
  event_pattern = jsonencode({
    source        = ["aws.ec2"]
    "detail-type" = ["EC2 Instance State-change Notification"]
    detail        = { state = ["stopped"] }
  })
  tags = var.config.tags
}

resource "aws_sqs_queue" "stop_events" {
  name                       = "${var.config.prefix}-warm-pool-stop-events"
  sqs_managed_sse_enabled    = true
  message_retention_seconds  = 3600
  visibility_timeout_seconds = local.visibility_timeout_seconds
  tags                       = var.config.tags
}

data "aws_iam_policy_document" "stop_events_queue" {
  statement {
    sid       = "AllowStopEventsRule"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.stop_events.arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.instance_stopped.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "stop_events" {
  queue_url = aws_sqs_queue.stop_events.id
  policy    = data.aws_iam_policy_document.stop_events_queue.json
}

resource "aws_cloudwatch_event_target" "stop_events" {
  rule = aws_cloudwatch_event_rule.instance_stopped.name
  arn  = aws_sqs_queue.stop_events.arn
}

module "consumer" {
  source = "../lambda"

  lambda = merge(var.config.lambda, {
    name    = "warm-pool-stop-events"
    handler = "index.warmPoolStopEvents"
    prefix  = var.config.prefix
    tags    = var.config.tags
    zip     = var.config.lambda.s3_key == null ? coalesce(var.config.lambda.zip, local.packaged_lambda_zip) : null
    environment_variables = {
      WARM_POOL_INDEX_TABLES = jsonencode({ for environment, table in var.config.index_tables : environment => table.name })
    }
  })
}

resource "aws_lambda_event_source_mapping" "stop_events" {
  event_source_arn                   = aws_sqs_queue.stop_events.arn
  function_name                      = module.consumer.lambda.function.arn
  batch_size                         = 100
  maximum_batching_window_in_seconds = var.config.batching_window_in_seconds
  function_response_types            = ["ReportBatchItemFailures"]
}

data "aws_iam_policy_document" "consumer" {
  statement {
    sid       = "ReadStopEvents"
    actions   = ["sqs:ChangeMessageVisibility", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ReceiveMessage"]
    resources = [aws_sqs_queue.stop_events.arn]
  }

  statement {
    sid       = "DescribeStoppedInstances"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }

  statement {
    sid       = "MarkPrimedInstancesWarm"
    actions   = ["dynamodb:UpdateItem"]
    resources = sort([for table in values(var.config.index_tables) : table.arn])
  }
}

resource "aws_iam_role_policy" "consumer" {
  name   = "warm-pool-stop-events"
  role   = module.consumer.lambda.role.name
  policy = data.aws_iam_policy_document.consumer.json
}
