output "bucket" {
  value = aws_s3_bucket.action_dist
}

output "runner_distribution_object_key" {
  value = local.action_runner_distribution_object_key
}

output "lambda" {
  value = aws_lambda_function.syncer
}

output "lambda_role" {
  value = aws_iam_role.syncer_lambda
}
