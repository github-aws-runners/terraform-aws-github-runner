output "assume_role_policy" {
  description = "MicroVM runner-role trust policy including any additional trust statements."
  value       = data.aws_iam_policy_document.assume_role.json
}
