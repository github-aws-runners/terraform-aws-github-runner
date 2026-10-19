output "assume_role_policy" {
  description = "EC2 runner-role trust policy with the optional additional trust policy merged into it."
  value       = data.aws_iam_policy_document.assume_role.json
}
