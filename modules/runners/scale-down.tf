resource "aws_lambda_function" "scale_down" {
  s3_bucket         = var.lambda_s3_bucket != null ? var.lambda_s3_bucket : null
  s3_key            = var.runners_lambda_s3_key != null ? var.runners_lambda_s3_key : null
  s3_object_version = var.runners_lambda_s3_object_version != null ? var.runners_lambda_s3_object_version : null
  filename          = var.lambda_s3_bucket == null ? local.lambda_zip : null
  source_code_hash  = var.lambda_s3_bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name     = "${var.environment}-scale-down"
  role              = aws_iam_role.scale_down.arn
  handler           = "index.scaleDown"
  runtime           = "nodejs12.x"
  timeout           = var.lambda_timeout_scale_down
  tags              = local.tags

  environment {
    variables = {
      ENVIRONMENT                             = var.environment
      ENABLE_ORGANIZATION_RUNNERS             = var.enable_organization_runners
      MINIMUM_RUNNING_TIME_IN_MINUTES         = var.minimum_running_time_in_minutes
      SCALE_DOWN_CONFIG                       = jsonencode(var.idle_config)
      GHES_URL                                = var.ghes_url
      PARAMETER_GITHUB_APP_CLIENT_ID_NAME     = var.github_app_parameters.client_id.name
      PARAMETER_GITHUB_APP_CLIENT_SECRET_NAME = var.github_app_parameters.client_secret.name
      PARAMETER_GITHUB_APP_ID_NAME            = var.github_app_parameters.id.name
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME    = var.github_app_parameters.key_base64.name
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

resource "aws_cloudwatch_log_group" "scale_down" {
  name              = "/aws/lambda/${aws_lambda_function.scale_down.function_name}"
  retention_in_days = var.logging_retention_in_days
  tags              = var.tags
}

resource "aws_cloudwatch_event_rule" "scale_down" {
  name                = "${var.environment}-scale-down-rule"
  schedule_expression = var.scale_down_schedule_expression
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "scale_down" {
  rule = aws_cloudwatch_event_rule.scale_down.name
  arn  = aws_lambda_function.scale_down.arn
}

resource "aws_lambda_permission" "scale_down" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scale_down.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.scale_down.arn
}

resource "aws_iam_role" "scale_down" {
  name                 = "${var.environment}-action-scale-down-lambda-role"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}

resource "aws_iam_role_policy" "scale_down" {
  name = "${var.environment}-lambda-scale-down-policy"
  role = aws_iam_role.scale_down.name
  policy = templatefile("${path.module}/policies/lambda-scale-down.json", {
    github_app_client_id_arn     = var.github_app_parameters.client_id.arn
    github_app_client_secret_arn = var.github_app_parameters.client_secret.arn
    github_app_id_arn            = var.github_app_parameters.id.arn
    github_app_key_base64_arn    = var.github_app_parameters.key_base64.arn
    kms_key_arn                  = local.kms_key_arn
  })
}

resource "aws_iam_role_policy" "scale_down_logging" {
  name = "${var.environment}-lambda-logging"
  role = aws_iam_role.scale_down.name
  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.scale_down.arn
  })
}

resource "aws_iam_role_policy_attachment" "scale_down_vpc_execution_role" {
  count      = length(var.lambda_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.scale_down.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}
