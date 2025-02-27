resource "aws_dynamodb_table" "runner_config" {
  name         = var.table_name
  billing_mode = var.billing_mode
  hash_key     = "instance_id"

  attribute {
    name = "instance_id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = var.tags
}
