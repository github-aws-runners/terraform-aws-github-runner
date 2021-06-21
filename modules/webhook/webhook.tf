locals {
  github_app_webhook_secret = var.encryption.encrypt ? aws_kms_ciphertext.github_app_webhook_secret[0].ciphertext_blob : var.github_app_webhook_secret
}

resource "aws_kms_ciphertext" "github_app_webhook_secret" {
  count     = var.encryption.encrypt ? 1 : 0
  key_id    = var.encryption.kms_key_id
  plaintext = var.github_app_webhook_secret

  context = {
    Environment = var.environment
  }
}

resource "aws_kms_grant" "webhook" {
  count             = var.encryption.encrypt ? 1 : 0
  name              = "${var.environment}-webhook"
  key_id            = var.encryption.kms_key_id
  grantee_principal = aws_iam_role.webhook_lambda.arn
  operations        = ["Decrypt"]

  constraints {
    encryption_context_equals = {
      Environment = var.environment
    }
  }
}

resource "aws_lambda_function" "webhook" {
  s3_bucket         = var.lambda_s3_bucket != null ? var.lambda_s3_bucket : null
  s3_key            = var.webhook_lambda_s3_key != null ? var.webhook_lambda_s3_key : null
  s3_object_version = var.webhook_lambda_s3_object_version != null ? var.webhook_lambda_s3_object_version : null
  filename          = var.lambda_s3_bucket == null ? local.lambda_zip : null
  source_code_hash  = var.lambda_s3_bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name     = "${var.environment}-webhook"
  role              = aws_iam_role.webhook_lambda.arn
  handler           = "index.githubWebhook"
  runtime           = "nodejs12.x"
  timeout           = var.lambda_timeout

  environment {
    variables = {
      ENVIRONMENT               = var.environment
      KMS_KEY_ID                = var.encryption.kms_key_id
      GITHUB_APP_WEBHOOK_SECRET = local.github_app_webhook_secret
      SQS_URL_WEBHOOK           = var.sqs_build_queue.id
      REPOSITORY_WHITE_LIST     = jsonencode(var.webhook_repository_white_list)
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "webhook" {
  name              = "/aws/lambda/${aws_lambda_function.webhook.function_name}"
  retention_in_days = var.logging_retention_in_days
  tags              = var.tags
}

resource "aws_lambda_permission" "webhook" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webhook.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.webhook.execution_arn}/*/*/${local.webhook_endpoint}"
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

resource "aws_iam_role" "webhook_lambda" {
  name                 = "${var.environment}-action-webhook-lambda-role"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = var.tags
}

resource "aws_iam_role_policy" "webhook_logging" {
  name = "${var.environment}-lambda-logging-policy"
  role = aws_iam_role.webhook_lambda.name
  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.webhook.arn
  })
}

resource "aws_iam_role_policy" "webhook_sqs" {
  name = "${var.environment}-lambda-webhook-publish-sqs-policy"
  role = aws_iam_role.webhook_lambda.name

  policy = templatefile("${path.module}/policies/lambda-publish-sqs-policy.json", {
    sqs_resource_arn = var.sqs_build_queue.arn
  })
}
