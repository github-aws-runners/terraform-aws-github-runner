locals {

  webhook_auth_enabled = length(var.webhook_allow_list.ipv4_cidr_blocks) > 0 ? true : false

}
resource "aws_lambda_function" "webhook_auth" {
  count = local.webhook_auth_enabled ? 1 : 0

  s3_bucket         = var.lambda_s3_bucket != null ? var.lambda_s3_bucket : null
  s3_key            = var.webhook_lambda_s3_key != null ? var.webhook_auth_lambda_s3_key : null
  s3_object_version = var.webhook_auth_lambda_s3_object_version != null ? var.webhook_auth_lambda_s3_object_version : null
  filename          = var.lambda_s3_bucket == null ? local.auth_lambda_zip : null
  source_code_hash  = var.lambda_s3_bucket == null ? filebase64sha256(local.auth_lambda_zip) : null
  function_name     = "${var.prefix}-webhook-auth"
  role              = aws_iam_role.webhook_auth_lambda[0].arn
  handler           = "index.handler"
  runtime           = var.lambda_runtime
  memory_size       = var.lambda_memory_size
  timeout           = var.lambda_timeout
  architectures     = [var.lambda_architecture]

  environment {
    variables = {
      for k, v in {
        LOG_LEVEL                                = var.log_level
        POWERTOOLS_LOGGER_LOG_EVENT              = var.log_level == "debug" ? "true" : "false"
        POWERTOOLS_TRACE_ENABLED                 = var.tracing_config.mode != null ? true : false
        POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.tracing_config.capture_http_requests
        POWERTOOLS_TRACER_CAPTURE_ERROR          = var.tracing_config.capture_error
        CIDR_IPV4_ALLOW_LIST                     = var.webhook_allow_list.ipv4_cidr_blocks
      } : k => v if v != null
    }
  }

  dynamic "vpc_config" {
    for_each = var.lambda_subnet_ids != null && var.lambda_security_group_ids != null ? [true] : []
    content {
      security_group_ids = var.lambda_security_group_ids
      subnet_ids         = var.lambda_subnet_ids
    }
  }

  tags = merge(var.tags, var.auth_lambda_tags)

  dynamic "tracing_config" {
    for_each = var.tracing_config.mode != null ? [true] : []
    content {
      mode = var.tracing_config.mode
    }
  }
}

resource "aws_iam_role" "webhook_auth_lambda" {
  count = local.webhook_auth_enabled ? 1 : 0

  name                 = "${var.prefix}-action-webhook-auth-lambda-role"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = var.tags
}

resource "aws_iam_role_policy" "xray-auth" {
  count  = var.tracing_config.mode != null && local.webhook_auth_enabled ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.webhook_auth_lambda[0].name
}

resource "aws_iam_role_policy_attachment" "webhook_auth_vpc_execution_role" {
  count      = length(var.lambda_subnet_ids) > 0 && local.webhook_auth_enabled ? 1 : 0
  role       = aws_iam_role.webhook_auth_lambda[0].name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "webhook_auth_logging" {
  count = local.webhook_auth_enabled ? 1 : 0

  name = "logging-policy"
  role = aws_iam_role.webhook_auth_lambda.name
  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.webhook_auth.arn
  })
}

resource "aws_cloudwatch_log_group" "webhook_auth" {
  name              = "/aws/lambda/${aws_lambda_function.webhook_auth.function_name}"
  retention_in_days = var.logging_retention_in_days
  kms_key_id        = var.logging_kms_key_id
  tags              = var.tags
}
