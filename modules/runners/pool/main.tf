resource "aws_lambda_function" "pool" {

  s3_bucket                      = var.config.lambda.s3_bucket != null ? var.config.lambda.s3_bucket : null
  s3_key                         = var.config.lambda.s3_key != null ? var.config.lambda.s3_key : null
  s3_object_version              = var.config.lambda.s3_object_version != null ? var.config.lambda.s3_object_version : null
  filename                       = var.config.lambda.s3_bucket == null ? var.config.lambda.zip : null
  source_code_hash               = var.config.lambda.s3_bucket == null ? filebase64sha256(var.config.lambda.zip) : null
  function_name                  = "${var.config.environment}-pool"
  role                           = aws_iam_role.pool.arn
  handler                        = "index.adjustPool"
  runtime                        = "nodejs14.x"
  timeout                        = var.config.lambda.timeout
  reserved_concurrent_executions = var.config.lambda.reserved_concurrent_executions
  memory_size                    = 512
  tags                           = var.config.tags

  environment {
    variables = {
      DISABLE_RUNNER_AUTOUPDATE            = var.config.runner.disable_runner_autoupdate
      ENABLE_EPHEMERAL_RUNNERS             = var.config.runner.ephemeral
      ENVIRONMENT                          = var.config.environment
      GHES_URL                             = var.config.ghes.url
      INSTANCE_ALLOCATION_STRATEGY         = var.config.instance_allocation_strategy
      INSTANCE_MAX_SPOT_PRICE              = var.config.instance_max_spot_price
      INSTANCE_TARGET_CAPACITY_TYPE        = var.config.instance_target_capacity_type
      INSTANCE_TYPES                       = join(",", var.config.instance_types)
      LAUNCH_TEMPLATE_NAME                 = var.config.runner.launch_template.name
      LOG_LEVEL                            = var.config.lambda.log_level
      LOG_TYPE                             = var.config.lambda.log_type
      NODE_TLS_REJECT_UNAUTHORIZED         = var.config.ghes.url != null && !var.config.ghes.ssl_verify ? 0 : 1
      PARAMETER_GITHUB_APP_ID_NAME         = var.config.github_app_parameters.id.name
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME = var.config.github_app_parameters.key_base64.name
      RUNNER_EXTRA_LABELS                  = var.config.runner.extra_labels
      RUNNER_GROUP_NAME                    = var.config.runner.group_name
      RUNNER_OWNER                         = var.config.runner.pool_owner
      SUBNET_IDS                           = join(",", var.config.subnet_ids)
    }
  }

  dynamic "vpc_config" {
    for_each = var.config.lambda.subnet_ids != null && var.config.lambda.security_group_ids != null ? [true] : []
    content {
      security_group_ids = var.config.lambda.security_group_ids
      subnet_ids         = var.config.lambda.subnet_ids
    }
  }
}

resource "aws_cloudwatch_log_group" "pool" {
  name              = "/aws/lambda/${aws_lambda_function.pool.function_name}"
  retention_in_days = var.config.lambda.logging_retention_in_days
  kms_key_id        = var.config.lambda.logging_kms_key_id
  tags              = var.config.tags
}

resource "aws_iam_role" "pool" {
  name                 = "${var.config.environment}-action-pool-lambda-role"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = var.config.role_path
  permissions_boundary = var.config.role_permissions_boundary
  tags                 = var.config.tags
}

resource "aws_iam_role_policy" "pool" {
  name = "${var.config.environment}-lambda-pool-policy"
  role = aws_iam_role.pool.name
  policy = templatefile("${path.module}/policies/lambda-pool.json", {
    arn_runner_instance_role  = var.config.runner.role.arn
    github_app_id_arn         = var.config.github_app_parameters.id.arn
    github_app_key_base64_arn = var.config.github_app_parameters.key_base64.arn
    kms_key_arn               = var.config.kms_key_arn
  })
}

resource "aws_iam_role_policy" "pool_logging" {
  name = "${var.config.environment}-lambda-logging"
  role = aws_iam_role.pool.name
  policy = templatefile("${path.module}/../policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.pool.arn
  })
}

resource "aws_iam_role_policy_attachment" "pool_vpc_execution_role" {
  count      = length(var.config.lambda.subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.pool.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "lambda_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# per config object one trigger is created to trigger the lambda.
resource "aws_cloudwatch_event_rule" "pool" {
  count = length(var.config.pool)

  name                = "${var.config.environment}-pool-${count.index}-rule"
  schedule_expression = var.config.pool[count.index].schedule_expression
  tags                = var.config.tags
}

resource "aws_cloudwatch_event_target" "pool" {
  count = length(var.config.pool)

  input = jsonencode({
    poolSize = var.config.pool[count.index].size
  })

  rule = aws_cloudwatch_event_rule.pool[count.index].name
  arn  = aws_lambda_function.pool.arn
}

resource "aws_lambda_permission" "pool" {
  count = length(var.config.pool)

  statement_id  = "AllowExecutionFromCloudWatch-${count.index}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pool.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.pool[count.index].arn
}
