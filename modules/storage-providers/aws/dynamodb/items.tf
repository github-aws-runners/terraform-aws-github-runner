resource "aws_dynamodb_table_item" "github_app_credentials" {
  table_name = aws_dynamodb_table.config.name
  hash_key   = aws_dynamodb_table.config.hash_key
  range_key  = aws_dynamodb_table.config.range_key

  item = jsonencode({
    scope = { S = local.global_scopes.github_app }
    id    = { S = "github-app-credentials" }
    value = { S = var.global_records.github_app_credentials }
  })
}

resource "aws_dynamodb_table_item" "github_webhook_secret" {
  table_name = aws_dynamodb_table.config.name
  hash_key   = aws_dynamodb_table.config.hash_key
  range_key  = aws_dynamodb_table.config.range_key

  item = jsonencode({
    scope = { S = local.global_scopes.webhook }
    id    = { S = "github-webhook-secret" }
    value = { S = var.global_records.github_webhook_secret }
  })
}

resource "aws_dynamodb_table_item" "runner_matcher_config" {
  table_name = aws_dynamodb_table.config.name
  hash_key   = aws_dynamodb_table.config.hash_key
  range_key  = aws_dynamodb_table.config.range_key

  item = jsonencode({
    scope = { S = local.global_scopes.matcher }
    id    = { S = "runner-matcher-config" }
    value = { S = var.global_records.runner_matcher_config }
  })
}

resource "aws_dynamodb_table_item" "runner_config" {
  for_each = var.entry_records

  table_name = aws_dynamodb_table.config.name
  hash_key   = aws_dynamodb_table.config.hash_key
  range_key  = aws_dynamodb_table.config.range_key

  item = jsonencode({
    scope = { S = local.entry_scopes[each.key].bootstrap }
    id    = { S = "runner-config" }
    value = { S = jsonencode(merge(each.value, {
      runner_config_storage = {
        provider     = "aws_dynamodb"
        table_name   = aws_dynamodb_table.runner_state.name
        access_scope = "compute-resource"
        id           = "config"
      }
    })) }
  })
}
