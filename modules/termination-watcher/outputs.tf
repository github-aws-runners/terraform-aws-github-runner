output "spot_termination_notification" {
  value = var.config.features.enable_spot_termination_notification_watcher ? {
    lambda           = module.termination_notification[0].lambda.function
    lambda_log_group = module.termination_notification[0].lambda.log_group
    lambda_role      = module.termination_notification[0].lambda.role
  } : null
}

output "spot_termination_handler" {
  value = var.config.features.enable_spot_termination_handler ? {
    lambda           = module.termination_handler[0].lambda.function
    lambda_log_group = module.termination_handler[0].lambda.log_group
    lambda_role      = module.termination_handler[0].lambda.role
  } : null
}

output "deregister_retry" {
  value = local.enable_runner_deregistration ? {
    queue_url        = aws_sqs_queue.deregister_retry[0].url
    queue_arn        = aws_sqs_queue.deregister_retry[0].arn
    dlq_url          = aws_sqs_queue.deregister_retry_dlq[0].url
    dlq_arn          = aws_sqs_queue.deregister_retry_dlq[0].arn
    lambda           = module.deregister_retry_lambda[0].lambda.function
    lambda_log_group = module.deregister_retry_lambda[0].lambda.log_group
    lambda_role      = module.deregister_retry_lambda[0].lambda.role
  } : null
}
