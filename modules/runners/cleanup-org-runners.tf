locals {
  cleanup_org_runners = {
    schedule_expression = var.cleanup_org_runners.schedule_expression
    state               = var.cleanup_org_runners.state
    lambda_timeout      = var.cleanup_org_runners.lambda_timeout
    lambda_memory_size  = var.cleanup_org_runners.lambda_memory_size
    config = {
      githubOrgOwner = var.cleanup_org_runners.config.githubOrgOwner
    }
  }
}

resource "aws_lambda_function" "cleanup_org_runners" {
  s3_bucket         = var.lambda_s3_bucket != null ? var.lambda_s3_bucket : null
  s3_key            = var.runners_lambda_s3_key != null ? var.runners_lambda_s3_key : null
  s3_object_version = var.runners_lambda_s3_object_version != null ? var.runners_lambda_s3_object_version : null
  filename          = var.lambda_s3_bucket == null ? local.lambda_zip : null
  source_code_hash  = var.lambda_s3_bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name     = "${var.prefix}-cleanup-org-runners"
  role              = aws_iam_role.cleanup_org_runners.arn
  handler           = "index.cleanupOrgRunnersHandler"
  runtime           = var.lambda_runtime
  timeout           = local.cleanup_org_runners.lambda_timeout
  memory_size       = local.cleanup_org_runners.lambda_memory_size
  tags              = merge(local.tags, var.lambda_tags)
  architectures     = [var.lambda_architecture]
  environment {
    variables = {
      ENVIRONMENT                              = var.prefix
      GHES_URL                                 = var.ghes_url
      RUNNER_LABELS                            = lower(join(",", var.runner_labels))
      RUNNER_OWNER                             = local.cleanup_org_runners.config.githubOrgOwner
      LOG_LEVEL                                = var.log_level
      NODE_TLS_REJECT_UNAUTHORIZED             = var.ghes_url != null && !var.ghes_ssl_verify ? 0 : 1
      PARAMETER_GITHUB_APP_ID_NAME             = var.github_app_parameters.id.name
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME     = var.github_app_parameters.key_base64.name
      POWERTOOLS_LOGGER_LOG_EVENT              = var.log_level == "debug" ? "true" : "false"
      POWERTOOLS_METRICS_NAMESPACE             = var.metrics.namespace
      POWERTOOLS_TRACE_ENABLED                 = var.tracing_config.mode != null ? true : false
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.tracing_config.capture_http_requests
      POWERTOOLS_TRACER_CAPTURE_ERROR          = var.tracing_config.capture_error
      POWERTOOLS_SERVICE_NAME                  = "runners-cleanup-org-runners"
    }
  }

  dynamic "vpc_config" {
    for_each = var.lambda_subnet_ids != null && var.lambda_security_group_ids != null ? [true] : []
    content {
      security_group_ids = var.lambda_security_group_ids
      subnet_ids         = var.lambda_subnet_ids
    }
  }

  dynamic "tracing_config" {
    for_each = var.tracing_config.mode != null ? [true] : []
    content {
      mode = var.tracing_config.mode
    }
  }
}

resource "aws_cloudwatch_log_group" "cleanup_org_runners" {
  name              = "/aws/lambda/${aws_lambda_function.cleanup_org_runners.function_name}"
  retention_in_days = var.logging_retention_in_days
  kms_key_id        = var.logging_kms_key_id
  tags              = var.tags
}

resource "aws_cloudwatch_event_rule" "cleanup_org_runners" {
  name                = "${var.prefix}-cleanup-org-runners"
  schedule_expression = local.cleanup_org_runners.schedule_expression
  tags                = var.tags
  state               = local.cleanup_org_runners.state
}

resource "aws_cloudwatch_event_target" "cleanup_org_runners" {
  rule = aws_cloudwatch_event_rule.cleanup_org_runners.name
  arn  = aws_lambda_function.cleanup_org_runners.arn
}

resource "aws_lambda_permission" "cleanup_org_runners" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cleanup_org_runners.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.cleanup_org_runners.arn
}

resource "aws_iam_role" "cleanup_org_runners" {
  name                 = "${var.prefix}-cleanup-org-runners-lambda"
  description          = "Lambda role for Cleanup Org Runners (${var.prefix})"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}

resource "aws_iam_role_policy" "cleanup_org_runners" {
  name = "cleanup-org-runners-policy"
  role = aws_iam_role.cleanup_org_runners.name
  policy = templatefile("${path.module}/policies/lambda-cleanup-org-runners.json", {
    github_app_id_arn         = var.github_app_parameters.id.arn
    github_app_key_base64_arn = var.github_app_parameters.key_base64.arn
    kms_key_arn               = local.kms_key_arn
    ami_kms_key_arn           = local.ami_kms_key_arn
  })
}

resource "aws_iam_role_policy" "cleanup_org_runners_logging" {
  name = "logging-policy"
  role = aws_iam_role.cleanup_org_runners.name
  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.cleanup_org_runners.arn
  })
}

resource "aws_iam_role_policy_attachment" "cleanup_org_runners_vpc_execution_role" {
  count      = length(var.lambda_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.cleanup_org_runners.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "cleanup_org_runners_xray" {
  count  = var.tracing_config.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.cleanup_org_runners.name
}
