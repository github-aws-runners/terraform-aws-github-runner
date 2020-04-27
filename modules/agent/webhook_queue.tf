resource "aws_sqs_queue" "webhook_events" {
  name                      = "${var.environment}-webhook-events.fifo"
  delay_seconds             = 30
  fifo_queue                = true
  receive_wait_time_seconds = 10
  # redrive_policy = jsonencode({
  #   deadLetterTargetArn = aws_sqs_queue.webhook_events_dlq.arn
  #   maxReceiveCount     = 4
  # })

  tags = var.tags
}

# resource "aws_sqs_queue" "webhook_events_dlq" {
#   name       = "${var.environment}-webhook-events-dlq"
#   fifo_queue = true
#   tags       = var.tags
# }
