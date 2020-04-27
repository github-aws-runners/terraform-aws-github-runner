output "distribution_bucket" {
  value = aws_s3_bucket.action_dist
}

output "s3_location_runner_distribution" {
  value = "s3://${aws_s3_bucket.action_dist.id}/${local.action_runner_distribution_object_key}"
}
