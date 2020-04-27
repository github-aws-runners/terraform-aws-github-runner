output "launch_template" {
  value = aws_launch_template.runner
}

output "role" {
  value = aws_iam_role.runner
}
