output "eventbridge" {
  value = aws_cloudwatch_event_bus.main
}

output "achive" {
  value = var.config.archive.enable ? aws_cloudwatch_event_archive.main : null
}

output "webhook_lambda_function" {
  value = aws_lambda_function.webhook
}
