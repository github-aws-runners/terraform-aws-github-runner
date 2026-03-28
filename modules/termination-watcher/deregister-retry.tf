# SQS-based deregistration retry for runners that return 422 (busy executing a job).
# When a runner can't be deregistered immediately, the termination-watcher Lambda
# sends a message to this queue with a 5-minute delay. By the time the message
# becomes visible, the EC2 instance has terminated and the runner appears offline,
# allowing clean GitHub API deletion.

# Dead-letter queue — messages that fail after 3 attempts land here for investigation
resource "aws_sqs_queue" "deregister_retry_dlq" {
  count = local.enable_runner_deregistration ? 1 : 0

  name                      = "${var.config.prefix}-deregister-retry-dlq"
  message_retention_seconds = 1209600 # 14 days
  tags                      = var.config.tags
}

# Main retry queue — 5-minute delivery delay gives EC2 time to terminate
resource "aws_sqs_queue" "deregister_retry" {
  count = local.enable_runner_deregistration ? 1 : 0

  name                       = "${var.config.prefix}-deregister-retry"
  delay_seconds              = 300   # 5 minutes
  message_retention_seconds  = 86400 # 24 hours
  visibility_timeout_seconds = 60    # Lambda timeout + buffer
  tags                       = var.config.tags

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.deregister_retry_dlq[0].arn
    maxReceiveCount     = 3
  })
}

# Dedicated Lambda function for processing SQS retry messages.
# Uses the same code package as the termination-watcher but with
# handler index.deregisterRetry (SQS event handler).
module "deregister_retry_lambda" {
  count  = local.enable_runner_deregistration ? 1 : 0
  source = "../lambda"

  lambda = merge(local.config, {
    name    = "deregister-retry"
    handler = "index.deregisterRetry"
    environment_variables = merge(
      local.deregistration_env_vars,
      var.config.environment_variables,
      {
        DEREGISTER_RETRY_QUEUE_URL = aws_sqs_queue.deregister_retry[0].url
        TAG_FILTERS                = jsonencode(var.config.tag_filters)
      }
    )
  })
}

# SQS event source mapping — triggers the retry Lambda when messages arrive
resource "aws_lambda_event_source_mapping" "deregister_retry" {
  count = local.enable_runner_deregistration ? 1 : 0

  event_source_arn = aws_sqs_queue.deregister_retry[0].arn
  function_name    = module.deregister_retry_lambda[0].lambda.function.arn
  batch_size       = 1 # Process one retry at a time to avoid GitHub rate limits
  enabled          = true
}

# IAM: Allow the retry Lambda to receive/delete from the retry queue
resource "aws_iam_role_policy" "deregister_retry_sqs" {
  count = local.enable_runner_deregistration ? 1 : 0

  name = "sqs-deregister-retry"
  role = module.deregister_retry_lambda[0].lambda.role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:SendMessage"
        ]
        Resource = [
          aws_sqs_queue.deregister_retry[0].arn,
          aws_sqs_queue.deregister_retry_dlq[0].arn
        ]
      }
    ]
  })
}

# IAM: Allow the retry Lambda to read SSM parameters (GitHub App credentials)
resource "aws_iam_role_policy" "deregister_retry_ssm" {
  count = local.enable_runner_deregistration ? 1 : 0

  name = "ssm-deregister-retry"
  role = module.deregister_retry_lambda[0].lambda.role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = local.ssm_parameter_arns
      }
    ]
  })
}

# IAM: Allow the retry Lambda to describe EC2 instances (for tag lookups)
resource "aws_iam_role_policy" "deregister_retry_ec2" {
  count = local.enable_runner_deregistration ? 1 : 0

  name = "ec2-deregister-retry"
  role = module.deregister_retry_lambda[0].lambda.role.name

  policy = templatefile("${path.module}/policies/lambda.json", {})
}

# IAM: Allow the notification Lambda to send messages to the retry queue
resource "aws_iam_role_policy" "notification_sqs_send" {
  count = local.enable_runner_deregistration && var.config.features.enable_spot_termination_notification_watcher ? 1 : 0

  name = "sqs-deregister-retry-send"
  role = module.termination_notification[0].lambda.role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.deregister_retry[0].arn
      }
    ]
  })
}

# IAM: Allow the termination handler Lambda to send messages to the retry queue
resource "aws_iam_role_policy" "termination_sqs_send" {
  count = local.enable_runner_deregistration && var.config.features.enable_spot_termination_handler ? 1 : 0

  name = "sqs-deregister-retry-send"
  role = module.termination_handler[0].lambda.role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.deregister_retry[0].arn
      }
    ]
  })
}
