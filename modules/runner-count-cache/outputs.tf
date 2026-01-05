output "dynamodb_table" {
  description = "DynamoDB table for runner counts"
  value = {
    name = aws_dynamodb_table.runner_counts.name
    arn  = aws_dynamodb_table.runner_counts.arn
  }
}

output "lambda_function" {
  description = "Counter Lambda function"
  value = {
    name = aws_lambda_function.counter.function_name
    arn  = aws_lambda_function.counter.arn
  }
}

output "eventbridge_rule" {
  description = "EventBridge rule for EC2 state changes"
  value = {
    name = aws_cloudwatch_event_rule.ec2_state_change.name
    arn  = aws_cloudwatch_event_rule.ec2_state_change.arn
  }
}

output "lambda_role" {
  description = "IAM role for the counter Lambda"
  value = {
    name = aws_iam_role.counter.name
    arn  = aws_iam_role.counter.arn
  }
}

output "cache_config" {
  description = "Configuration for scale-up Lambda to use the cache"
  value = {
    table_name              = aws_dynamodb_table.runner_counts.name
    stale_threshold_ms      = var.cache_stale_threshold_ms
  }
}
