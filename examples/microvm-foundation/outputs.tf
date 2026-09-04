output "artifact_bucket_name" {
  description = "S3 bucket to pass to the MicroVM image build."
  value       = module.microvm_foundation.artifact_bucket_name
}

output "artifact_prefix" {
  description = "S3 prefix used for MicroVM build artifacts."
  value       = module.microvm_foundation.artifact_prefix
}

output "build_role_arn" {
  description = "Lambda build role ARN to pass to the image build."
  value       = module.microvm_foundation.build_role_arn
}

output "connector_arns" {
  description = "Regional Network Connector ARNs keyed by configuration name."
  value       = module.microvm_foundation.connector_arns
}

output "usage_policy_arn" {
  description = "Unattached runtime usage policy for the runner control-plane role."
  value       = module.microvm_foundation.usage_policy_arn
}
