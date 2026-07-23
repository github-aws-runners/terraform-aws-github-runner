# Expose selected bucket attributes instead of the whole resource to avoid
# "Value derived from a deprecated source" warnings (acl, policy, website_*, ...).
output "bucket" {
  value = {
    id     = aws_s3_bucket.action_dist.id
    arn    = aws_s3_bucket.action_dist.arn
    bucket = aws_s3_bucket.action_dist.bucket
    region = aws_s3_bucket.action_dist.region
  }
}

output "runner_distribution_object_key" {
  value = local.action_runner_distribution_object_key
}

output "lambda" {
  value = aws_lambda_function.syncer
}

output "lambda_log_group" {
  value = aws_cloudwatch_log_group.syncer
}

# Expose selected role attributes instead of the whole resource to avoid
# "Value derived from a deprecated source" warnings (managed_policy_arns).
output "lambda_role" {
  value = {
    id   = aws_iam_role.syncer_lambda.id
    arn  = aws_iam_role.syncer_lambda.arn
    name = aws_iam_role.syncer_lambda.name
  }
}
