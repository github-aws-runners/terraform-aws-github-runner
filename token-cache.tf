resource "aws_dynamodb_table" "installation_tokens" {
  name         = "${var.prefix}-installation-tokens"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "installation_id"

  attribute {
    name = "installation_id"
    type = "N"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(local.tags, {
    Name = "${var.prefix}-installation-tokens"
  })
}
