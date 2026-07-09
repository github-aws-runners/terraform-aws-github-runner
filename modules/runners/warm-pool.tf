# Warm Pool DynamoDB table and IAM policies
# Only created when warm_pool_config.enabled = true

resource "aws_dynamodb_table" "warm_pool" {
  count = var.warm_pool_config.enabled ? 1 : 0

  name         = "${var.prefix}-warm-pool"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "instanceId"

  attribute {
    name = "instanceId"
    type = "S"
  }

  attribute {
    name = "runnerOwner"
    type = "S"
  }

  attribute {
    name = "stoppedAt"
    type = "S"
  }

  global_secondary_index {
    name            = "by-owner"
    hash_key        = "runnerOwner"
    range_key       = "stoppedAt"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = local.tags
}

# IAM policy for warm pool operations (DynamoDB + EC2 stop/start)
resource "aws_iam_role_policy" "scale_down_warm_pool" {
  count = var.warm_pool_config.enabled ? 1 : 0

  name = "warm-pool-policy"
  role = aws_iam_role.scale_down.name
  policy = templatefile("${path.module}/policies/lambda-warm-pool.json", {
    dynamodb_table_arn = aws_dynamodb_table.warm_pool[0].arn
    environment        = var.prefix
  })
}

resource "aws_iam_role_policy" "scale_up_warm_pool" {
  count = var.warm_pool_config.enabled ? 1 : 0

  name = "warm-pool-policy"
  role = aws_iam_role.scale_up.name
  policy = templatefile("${path.module}/policies/lambda-warm-pool.json", {
    dynamodb_table_arn = aws_dynamodb_table.warm_pool[0].arn
    environment        = var.prefix
  })
}

resource "aws_iam_role_policy" "pool_warm_pool" {
  count = var.warm_pool_config.enabled && length(var.pool_config) > 0 ? 1 : 0

  name = "warm-pool-policy"
  role = module.pool[0].role_pool.name
  policy = templatefile("${path.module}/policies/lambda-warm-pool.json", {
    dynamodb_table_arn = aws_dynamodb_table.warm_pool[0].arn
    environment        = var.prefix
  })
}
