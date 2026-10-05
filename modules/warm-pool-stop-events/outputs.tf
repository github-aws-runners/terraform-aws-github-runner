output "rule" {
  value = aws_cloudwatch_event_rule.instance_stopped
}

output "queue" {
  value = aws_sqs_queue.stop_events
}

output "lambda" {
  value = module.consumer.lambda
}

output "event_source_mapping" {
  value = aws_lambda_event_source_mapping.stop_events
}
