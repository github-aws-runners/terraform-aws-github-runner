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
}

# Permission for EventBridge to invoke the Lambda
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.counter.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ec2_state_change.arn
}
