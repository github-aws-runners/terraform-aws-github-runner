# Warm Pool DynamoDB table and IAM policies
# Only created when warm_pool.enabled = true

resource "aws_dynamodb_table" "warm_pool" {
  count = var.warm_pool.enabled ? 1 : 0

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
  count = var.warm_pool.enabled ? 1 : 0

  name = "warm-pool-policy"
  role = aws_iam_role.scale_down.name
  policy = templatefile("${path.module}/policies/lambda-warm-pool.json", {
    dynamodb_table_arn = aws_dynamodb_table.warm_pool[0].arn
    environment        = var.prefix
  })
}

resource "aws_iam_role_policy" "scale_up_warm_pool" {
  count = var.warm_pool.enabled ? 1 : 0

  name = "warm-pool-policy"
  role = aws_iam_role.scale_up.name
  policy = templatefile("${path.module}/policies/lambda-warm-pool.json", {
    dynamodb_table_arn = aws_dynamodb_table.warm_pool[0].arn
    environment        = var.prefix
  })
}

resource "aws_iam_role_policy" "pool_warm_pool" {
  count = var.warm_pool.enabled && length(var.pool_config) > 0 ? 1 : 0

  name = "warm-pool-policy"
  role = module.pool[0].role_pool.name
  policy = templatefile("${path.module}/policies/lambda-warm-pool.json", {
    dynamodb_table_arn = aws_dynamodb_table.warm_pool[0].arn
    environment        = var.prefix
  })
}

# Lets a persistent-spot runner cancel its own spot request before self-terminating (ephemeral
# runners), so a terminated runner does not leave the request active to relaunch a replacement.
resource "aws_iam_role_policy" "runner_spot_cancel" {
  count = var.warm_pool.enabled && var.instance_target_capacity_type == "spot" && length(aws_iam_role.runner) > 0 ? 1 : 0

  name   = "warm-pool-spot-cancel"
  role   = aws_iam_role.runner[0].name
  policy = file("${path.module}/policies/instance-spot-cancel.json")
}

# Lets a runner signal (via its start script) that it has registered and is safe to stop into the
# warm pool. The pool lambda polls this marker instead of waiting a fixed delay.
resource "aws_iam_role_policy" "runner_warm_pool_ready" {
  count = var.warm_pool.enabled && length(aws_iam_role.runner) > 0 ? 1 : 0

  name = "warm-pool-ready"
  role = aws_iam_role.runner[0].name
  policy = templatefile("${path.module}/policies/instance-warm-pool-ready.json", {
    dynamodb_table_arn = aws_dynamodb_table.warm_pool[0].arn
  })
}
