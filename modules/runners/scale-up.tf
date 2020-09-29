resource "aws_kms_grant" "scale_up" {
  count             = var.encryption.encrypt ? 1 : 0
  name              = "${var.environment}-scale-up"
  key_id            = var.encryption.kms_key_id
  grantee_principal = aws_iam_role.scale_up.arn
  operations        = ["Decrypt"]

  constraints {
    encryption_context_equals = {
      Environment = var.environment
    }
  }
}

resource "aws_lambda_function" "scale_up" {
  filename                       = local.lambda_zip
  source_code_hash               = filebase64sha256(local.lambda_zip)
  function_name                  = "${var.environment}-scale-up"
  role                           = aws_iam_role.scale_up.arn
  handler                        = "index.scaleUp"
  runtime                        = "nodejs12.x"
  timeout                        = var.lambda_timeout_scale_up
  reserved_concurrent_executions = 1
  tags                           = local.tags

  environment {
    variables = {
      ENVIRONMENT                 = var.environment
      KMS_KEY_ID                  = var.encryption.kms_key_id
      ENABLE_ORGANIZATION_RUNNERS = var.enable_organization_runners
      RUNNERS_MAXIMUM_COUNT       = var.runners_maximum_count
      GITHUB_APP_KEY_BASE64       = local.github_app_key_base64
      GITHUB_APP_ID               = var.github_app.id
      GITHUB_APP_CLIENT_ID        = var.github_app.client_id
      GITHUB_APP_CLIENT_SECRET    = local.github_app_client_secret
      SUBNET_IDS                  = join(",", var.subnet_ids)
      LAUNCH_TEMPLATE_NAME        = aws_launch_template.runner.name
      SCALE_DOWN_CONFIG           = jsonencode(var.idle_config)
    }
  }
}

resource "aws_cloudwatch_log_group" "scale_up" {
  name              = "/aws/lambda/${aws_lambda_function.scale_up.function_name}"
  retention_in_days = var.logging_retention_in_days
  tags              = var.tags
}

resource "aws_cloudwatch_event_rule" "scale_up" {
  name                = "${var.environment}-scale-up-rule"
  schedule_expression = var.scale_up_schedule_expression
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "scale_up" {
  rule = aws_cloudwatch_event_rule.scale_up.name
  arn  = aws_lambda_function.scale_up.arn
}

resource "aws_lambda_permission" "scale_up" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scale_up.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.scale_up.arn
}

resource "aws_iam_role" "scale_up" {
  name                 = "${var.environment}-action-scale-up-lambda-role"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}

resource "aws_iam_role_policy" "scale_up" {
  name = "${var.environment}-lambda-scale-down-policy"
  role = aws_iam_role.scale_up.name
  policy = templatefile("${path.module}/policies/lambda-scale-up.json", {
    arn_runner_instance_role = aws_iam_role.runner.arn
  })
}

resource "aws_iam_role_policy" "scale_up_logging" {
  name = "${var.environment}-lambda-logging"
  role = aws_iam_role.scale_up.name
  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.scale_up.arn
  })
}
