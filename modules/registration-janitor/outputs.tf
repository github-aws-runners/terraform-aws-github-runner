output "lambda" {
  description = "Scheduled registration janitor Lambda resources."
  value       = module.lambda.lambda
}

output "dead_letter_queue" {
  description = "Failed confirmation messages. Inspect before redriving; candidates expire after 24 hours."
  value       = aws_sqs_queue.dead_letter
}
