output "assume_role_policy_json" {
  description = "EC2 runner-role trust policy document."
  value       = data.aws_iam_policy_document.assume_role.json
}

output "inline_policies" {
  description = "EC2 runner-role inline policies keyed by stable provider policy identifiers."
  value       = local.inline_policies
}

output "managed_policy_arns" {
  description = "EC2 provider-managed runner-role policy ARNs keyed by stable identifiers."
  value       = {}
}
