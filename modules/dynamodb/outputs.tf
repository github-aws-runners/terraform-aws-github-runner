output "table_name" {
  value = aws_dynamodb_table.runner_config.name
}

output "table_arn" {
  value = aws_dynamodb_table.runner_config.arn
}
