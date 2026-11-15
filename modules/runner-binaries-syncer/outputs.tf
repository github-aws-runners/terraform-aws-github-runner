# Export explicit attributes, not the whole resource, to avoid deprecated-source warnings (#5159).
output "bucket" {
  value = {
    arn                         = aws_s3_bucket.action_dist.arn
    bucket                      = aws_s3_bucket.action_dist.bucket
    bucket_domain_name          = aws_s3_bucket.action_dist.bucket_domain_name
    bucket_prefix               = aws_s3_bucket.action_dist.bucket_prefix
    bucket_region               = aws_s3_bucket.action_dist.bucket_region
    bucket_regional_domain_name = aws_s3_bucket.action_dist.bucket_regional_domain_name
    force_destroy               = aws_s3_bucket.action_dist.force_destroy
    hosted_zone_id              = aws_s3_bucket.action_dist.hosted_zone_id
    id                          = aws_s3_bucket.action_dist.id
    object_lock_enabled         = aws_s3_bucket.action_dist.object_lock_enabled
    region                      = aws_s3_bucket.action_dist.region
    tags                        = aws_s3_bucket.action_dist.tags
    tags_all                    = aws_s3_bucket.action_dist.tags_all
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

# Export explicit attributes, not the whole resource, to avoid deprecated-source warnings (#5159).
output "lambda_role" {
  value = {
    arn                   = aws_iam_role.syncer_lambda.arn
    assume_role_policy    = aws_iam_role.syncer_lambda.assume_role_policy
    create_date           = aws_iam_role.syncer_lambda.create_date
    description           = aws_iam_role.syncer_lambda.description
    force_detach_policies = aws_iam_role.syncer_lambda.force_detach_policies
    id                    = aws_iam_role.syncer_lambda.id
    max_session_duration  = aws_iam_role.syncer_lambda.max_session_duration
    name                  = aws_iam_role.syncer_lambda.name
    name_prefix           = aws_iam_role.syncer_lambda.name_prefix
    path                  = aws_iam_role.syncer_lambda.path
    permissions_boundary  = aws_iam_role.syncer_lambda.permissions_boundary
    tags                  = aws_iam_role.syncer_lambda.tags
    tags_all              = aws_iam_role.syncer_lambda.tags_all
    unique_id             = aws_iam_role.syncer_lambda.unique_id
  }
}
