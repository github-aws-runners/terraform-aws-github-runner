output "assume_role_policy" {
  description = "Lambda MicroVM runner-role trust policy."
  value       = data.aws_iam_policy_document.assume_role.json
}
