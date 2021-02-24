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
  s3_bucket                      = var.lambda_s3_bucket != null ? var.lambda_s3_bucket : null
  s3_key                         = var.runners_lambda_s3_key != null ? var.runners_lambda_s3_key : null
  s3_object_version              = var.runners_lambda_s3_object_version != null ? var.runners_lambda_s3_object_version : null
  filename                       = var.lambda_s3_bucket == null ? local.lambda_zip : null
  source_code_hash               = var.lambda_s3_bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name                  = "${var.environment}-scale-up"
  role                           = aws_iam_role.scale_up.arn
  handler                        = "index.scaleUp"
  runtime                        = "nodejs12.x"
  timeout                        = var.lambda_timeout_scale_up
  reserved_concurrent_executions = 1
  tags                           = local.tags

  environment {
    variables = {
      ENABLE_ORGANIZATION_RUNNERS = var.enable_organization_runners
      ENVIRONMENT                 = var.environment
      GHES_URL                    = var.ghes_url
      GITHUB_APP_CLIENT_ID        = var.github_app.client_id
      GITHUB_APP_CLIENT_SECRET    = local.github_app_client_secret
      GITHUB_APP_ID               = var.github_app.id
      GITHUB_APP_KEY_BASE64       = local.github_app_key_base64
      KMS_KEY_ID                  = var.encryption.kms_key_id
      RUNNER_EXTRA_LABELS         = var.runner_extra_labels
      RUNNER_GROUP_NAME           = var.runner_group_name
      RUNNERS_MAXIMUM_COUNT       = var.runners_maximum_count
      LAUNCH_TEMPLATE_NAME        = aws_launch_template.runner.name
      LAUNCH_TEMPLATE_VERSION     = aws_launch_template.runner.latest_version
      SUBNET_IDS                  = join(",", var.subnet_ids)
      SECONDARY_INSTANCE_TYPE     = var.secondary_instance_type
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

resource "aws_cloudwatch_log_group" "scale_up" {
  name              = "/aws/lambda/${aws_lambda_function.scale_up.function_name}"
  retention_in_days = var.logging_retention_in_days
  tags              = var.tags
}

resource "aws_lambda_event_source_mapping" "scale_up" {
  event_source_arn = var.sqs_build_queue.arn
  function_name    = aws_lambda_function.scale_up.arn
}

resource "aws_lambda_permission" "scale_runners_lambda" {
  statement_id  = "AllowExecutionFromSQS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scale_up.function_name
  principal     = "sqs.amazonaws.com"
  source_arn    = var.sqs_build_queue.arn
}

resource "aws_iam_role" "scale_up" {
  name                 = "${var.environment}-action-scale-up-lambda-role"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}

resource "aws_iam_role_policy" "scale_up" {
  name = "${var.environment}-lambda-scale-up-policy"
  role = aws_iam_role.scale_up.name

  policy = templatefile("${path.module}/policies/lambda-scale-up.json", {
    arn_runner_instance_role = aws_iam_role.runner.arn
    sqs_arn                  = var.sqs_build_queue.arn
  })
}

resource "aws_iam_role_policy" "scale_up_logging" {
  name = "${var.environment}-lambda-logging"
  role = aws_iam_role.scale_up.name
  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.scale_up.arn
  })
}

resource "aws_iam_role_policy" "service_linked_role" {
  count  = var.create_service_linked_role_spot ? 1 : 0
  name   = "${var.environment}-service_linked_role"
  role   = aws_iam_role.scale_up.name
  policy = templatefile("${path.module}/policies/service-linked-role-create-policy.json", {})
}

resource "aws_iam_role_policy_attachment" "scale_up_vpc_execution_role" {
  count      = length(var.lambda_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.scale_up.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}
