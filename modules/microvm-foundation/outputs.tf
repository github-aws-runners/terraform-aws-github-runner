output "artifact_bucket_name" {
  description = "Name of the regional S3 bucket used for Lambda MicroVM build artifacts."
  value       = aws_s3_bucket.artifacts.id
}

output "artifact_bucket_arn" {
  description = "ARN of the regional S3 bucket used for Lambda MicroVM build artifacts."
  value       = aws_s3_bucket.artifacts.arn
}

output "artifact_prefix" {
  description = "Bucket prefix to which the MicroVM image publisher uploads content-addressed build artifacts."
  value       = local.artifact_prefix
}

output "build_role_arn" {
  description = "ARN of the Lambda-trusted role used during MicroVM image builds."
  value       = aws_iam_role.build.arn
}

output "usage_policy_arn" {
  description = "ARN of the reusable regional policy for operating MicroVM images in the reserved namespace and passing their Network Connectors."
  value       = aws_iam_policy.usage.arn
}

output "connector_arns" {
  description = "Map of connector key to the ARN of each Lambda Network Connector."
  value       = local.connector_arns
}

output "security_group_ids" {
  description = "Map of connector key to its dedicated no-ingress security group ID."
  value       = { for connector_key, security_group in aws_security_group.connector : connector_key => security_group.id }
}
