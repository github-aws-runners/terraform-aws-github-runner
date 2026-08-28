# Runner Count Cache Module
#
# This module creates a DynamoDB-based cache for tracking the number of active
# EC2 runners. It uses EventBridge to listen for EC2 state changes and updates
# a counter in DynamoDB, significantly reducing the need for DescribeInstances
# API calls during scale-up operations.
#
# This addresses the performance bottleneck described in Issue #4710:
# https://github.com/github-aws-runners/terraform-aws-github-runner/issues/4710

locals {
  tags = var.tags
}

# DynamoDB table to store runner counts per environment/type/owner
resource "aws_dynamodb_table" "runner_counts" {
  name         = "${var.prefix}-runner-counts"
  billing_mode = "PAY_PER_REQUEST" # Auto-scales with no provisioning needed

  hash_key = "pk" # Format: "environment#runnerType#runnerOwner"

  attribute {
    name = "pk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  # Optional encryption with customer-managed KMS key
  dynamic "server_side_encryption" {
    for_each = var.kms_key_arn != null ? [1] : []
    content {
      enabled     = true
      kms_key_arn = var.kms_key_arn
    }
  }

  point_in_time_recovery {
    enabled = false # Not needed for cache data
  }

  tags = merge(local.tags, {
    Name = "${var.prefix}-runner-counts"
  })
}

# EventBridge rule to capture EC2 instance state changes
resource "aws_cloudwatch_event_rule" "ec2_state_change" {
  name        = "${var.prefix}-runner-state-change"
  description = "Captures EC2 instance state changes for GitHub Action runners"

  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["EC2 Instance State-change Notification"]
    detail = {
      state = ["running", "pending", "terminated", "stopped", "shutting-down"]
    }
  })

  tags = local.tags
}

# EventBridge target to invoke the counter Lambda
resource "aws_cloudwatch_event_target" "counter_lambda" {
  rule = aws_cloudwatch_event_rule.ec2_state_change.name
  arn  = aws_lambda_function.counter.arn

  # EventBridge delivery is at-least-once but not guaranteed. If the counter
  # Lambda fails through the whole retry window (e.g. a sustained DynamoDB
  # error), the event is dead-lettered rather than dropped silently, which would
  # otherwise drift the counter until the read-side staleness fallback corrects it.
  retry_policy {
    maximum_event_age_in_seconds = 3600 # 1h; older events are reconciled against the provider
    maximum_retry_attempts       = 10
  }

  dead_letter_config {
    arn = aws_sqs_queue.counter_dlq.arn
  }
}

# Dead-letter queue for state-change events that fail delivery to the counter Lambda.
# Captures the silent-loss failure mode (retry exhaustion) for investigation/replay.
resource "aws_sqs_queue" "counter_dlq" {
  name                      = "${var.prefix}-runner-count-dlq"
  message_retention_seconds = 1209600 # 14 days
  sqs_managed_sse_enabled   = true
  tags                      = local.tags
}

# Allow the state-change rule to write failed deliveries to the DLQ.
resource "aws_sqs_queue_policy" "counter_dlq" {
  queue_url = aws_sqs_queue.counter_dlq.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.counter_dlq.arn
      Condition = {
        ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.ec2_state_change.arn }
      }
    }]
  })
}

# Alarm when the DLQ is non-empty: state-change events failed all delivery
# attempts, so the counter may be drifting and the messages need replay.
resource "aws_cloudwatch_metric_alarm" "counter_dlq_not_empty" {
  alarm_name          = "${var.prefix}-runner-count-dlq-not-empty"
  alarm_description   = "EC2 state-change events failed delivery to the runner count Lambda and landed in the DLQ."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    QueueName = aws_sqs_queue.counter_dlq.name
  }
  tags = local.tags
}

# Permission for EventBridge to invoke the Lambda
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.counter.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ec2_state_change.arn
}
