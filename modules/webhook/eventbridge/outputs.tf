output "eventbridge" {
  value = {
    event_bus = aws_cloudwatch_event_bus.main
    archive   = aws_cloudwatch_event_archive.main
  }
}

output "webhook" {
  value = {
    lambda    = aws_lambda_function.webhook
    log_group = aws_cloudwatch_log_group.webhook
    role      = aws_iam_role.webhook_lambda
  }
}

output "dispatcher" {
  value = {
    lambda    = aws_lambda_function.dispatcher
    log_group = aws_cloudwatch_log_group.dispatcher
    role      = aws_iam_role.dispatcher_lambda
  }
}
