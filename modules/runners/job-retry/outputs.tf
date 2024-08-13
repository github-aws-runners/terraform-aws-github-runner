output "lambda" {
  value = {
    function  = module.job_retry_check.lambda
    log_group = module.job_retry_check.lambda.log_group
    role      = module.job_retry_check.lambda.role
  }
}

output "job_retry_check_queue" {
  value = aws_sqs_queue.job_retry_check_queue
}
