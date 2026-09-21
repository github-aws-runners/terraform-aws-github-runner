resource "aws_dynamodb_table" "config" {
  name         = "${var.prefix}-config"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "scope"
  range_key    = "id"

  attribute {
    name = "scope"
    type = "S"
  }

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = var.config.config.point_in_time_recovery_enabled
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.config.config.kms_key_arn
  }

  deletion_protection_enabled = var.config.config.deletion_protection_enabled
  tags                        = merge(var.tags, var.config.config.tags)
}

resource "aws_dynamodb_table" "runner_state" {
  name         = "${var.prefix}-runner-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "scope"
  range_key    = "id"

  attribute {
    name = "scope"
    type = "S"
  }

  attribute {
    name = "id"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.config.runner_state.point_in_time_recovery_enabled
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.config.runner_state.kms_key_arn
  }

  deletion_protection_enabled = var.config.runner_state.deletion_protection_enabled
  tags                        = merge(var.tags, var.config.runner_state.tags)
}
