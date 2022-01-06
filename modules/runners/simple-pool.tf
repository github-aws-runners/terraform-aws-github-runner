resource "aws_lambda_function" "simple_pool" {
  count = length(var.simple_pool_config) == 0 ? 0 : 1

  s3_bucket                      = var.lambda_s3_bucket != null ? var.lambda_s3_bucket : null
  s3_key                         = var.runners_lambda_s3_key != null ? var.runners_lambda_s3_key : null
  s3_object_version              = var.runners_lambda_s3_object_version != null ? var.runners_lambda_s3_object_version : null
  filename                       = var.lambda_s3_bucket == null ? local.lambda_zip : null
  source_code_hash               = var.lambda_s3_bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name                  = "${var.environment}-simple-pool"
  role                           = aws_iam_role.simple_pool[0].arn
  handler                        = "index.adjustPool"
  runtime                        = "nodejs14.x"
  timeout                        = var.simple_pool_lambda_timeout
  reserved_concurrent_executions = var.simple_pool_reserved_concurrent_executions
  memory_size                    = 512
  tags                           = local.tags

  environment {
    variables = {
      RUNNER_OWNER                         = var.simple_pool_runner_owner
      ENVIRONMENT                          = var.environment
      GHES_URL                             = var.ghes_url
      LAUNCH_TEMPLATE_NAME                 = aws_launch_template.runner.name
      LOG_LEVEL                            = var.log_level
      LOG_TYPE                             = var.log_type
      NODE_TLS_REJECT_UNAUTHORIZED         = var.ghes_url != null && !var.ghes_ssl_verify ? 0 : 1
      PARAMETER_GITHUB_APP_ID_NAME         = var.github_app_parameters.id.name
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME = var.github_app_parameters.key_base64.name
      RUNNER_EXTRA_LABELS                  = var.runner_extra_labels
      RUNNER_GROUP_NAME                    = var.runner_group_name
      SUBNET_IDS                           = join(",", var.subnet_ids)
      ENABLE_EPHEMERAL_RUNNERS             = var.enable_ephemeral_runners
      INSTANCE_TYPES                       = join(",", var.instance_types)
      INSTANCE_TARGET_CAPACITY_TYPE        = var.instance_target_capacity_type
      INSTANCE_MAX_SPOT_PRICE              = var.instance_max_spot_price
      INSTANCE_ALLOCATION_STRATEGY         = var.instance_allocation_strategy
    }
  }

  dynamic "vpc_config" {
    for_each = var.lambda_subnet_ids != null && var.lambda_security_group_ids != null ? [true] : []
    content {
      security_group_ids = var.lambda_security_group_ids
      subnet_ids         = var.lambda_subnet_ids
    }
  }
}

resource "aws_cloudwatch_log_group" "simple_pool" {
  count = length(var.simple_pool_config) == 0 ? 0 : 1

  name              = "/aws/lambda/${aws_lambda_function.simple_pool[0].function_name}"
  retention_in_days = var.logging_retention_in_days
  tags              = var.tags
}

resource "aws_cloudwatch_event_rule" "simple_pool" {
  count = length(var.simple_pool_config) == 0 ? 0 : length(var.simple_pool_config)

  name                = "${var.environment}-simple-pool-rule"
  schedule_expression = var.simple_pool_config[count.index].schedule_expression
  tags                = var.tags
}


resource "aws_cloudwatch_event_target" "simple_pool" {
  count = length(var.simple_pool_config) == 0 ? 0 : length(var.simple_pool_config)

  input = jsonencode({
    simplePoolSize = var.simple_pool_config[count.index].pool_size
  })

  rule = aws_cloudwatch_event_rule.simple_pool[count.index].name
  arn  = aws_lambda_function.simple_pool[0].arn
}

resource "aws_lambda_permission" "simple_pool" {
  count = length(var.simple_pool_config) == 0 ? 0 : 1

  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.simple_pool[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.simple_pool[0].arn
}

resource "aws_iam_role" "simple_pool" {
  count = length(var.simple_pool_config) == 0 ? 0 : 1

  name                 = "${var.environment}-action-simple-pool-lambda-role"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}

resource "aws_iam_role_policy" "simple_pool" {
  count = length(var.simple_pool_config) == 0 ? 0 : 1

  name = "${var.environment}-lambda-simple-pool-policy"
  role = aws_iam_role.simple_pool[0].name
  policy = templatefile("${path.module}/policies/lambda-simple-pool.json", {
    arn_runner_instance_role  = aws_iam_role.runner.arn
    github_app_id_arn         = var.github_app_parameters.id.arn
    github_app_key_base64_arn = var.github_app_parameters.key_base64.arn
    kms_key_arn               = local.kms_key_arn
  })
}

resource "aws_iam_role_policy" "simple_pool_logging" {
  count = length(var.simple_pool_config) == 0 ? 0 : 1

  name = "${var.environment}-lambda-logging"
  role = aws_iam_role.simple_pool[0].name
  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.simple_pool[0].arn
  })
}

resource "aws_iam_role_policy_attachment" "simple_pool_vpc_execution_role" {
  count      = length(var.simple_pool_config) != 0 && length(var.lambda_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.simple_pool[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}
