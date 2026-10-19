output "lambda" {
  description = "Job-retry Lambda resources."
  value = {
    function  = aws_lambda_function.job_retry
    log_group = aws_cloudwatch_log_group.job_retry
    role      = aws_iam_role.job_retry
  }
}

output "job_retry_check_queue" {
  description = "Queue consumed by the job-retry Lambda."
  value       = aws_sqs_queue.job_retry_check_queue
}
