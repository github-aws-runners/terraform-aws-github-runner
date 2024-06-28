locals {
  ssm_housekeeper = {
    schedule_expression = var.ssm_housekeeper.schedule_expression
    state               = var.ssm_housekeeper.state
    lambda_timeout      = var.ssm_housekeeper.lambda_timeout
    lambda_memory_size  = var.ssm_housekeeper.lambda_memory_size
    config = {
      tokenPath      = var.ssm_housekeeper.config.tokenPath == null ? local.token_path : var.ssm_housekeeper.config.tokenPath
      minimumDaysOld = var.ssm_housekeeper.config.minimumDaysOld
      dryRun         = var.ssm_housekeeper.config.dryRun
    }
  }
}

resource "aws_lambda_function" "ssm_housekeeper" {
  s3_bucket         = var.lambda_s3_bucket != null ? var.lambda_s3_bucket : null
  s3_key            = var.runners_lambda_s3_key != null ? var.runners_lambda_s3_key : null
  s3_object_version = var.runners_lambda_s3_object_version != null ? var.runners_lambda_s3_object_version : null
  filename          = var.lambda_s3_bucket == null ? local.lambda_zip : null
  source_code_hash  = var.lambda_s3_bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name     = "${var.prefix}-ssm-housekeeper"
  role              = aws_iam_role.ssm_housekeeper.arn
  handler           = "index.ssmHousekeeper"
  runtime           = var.lambda_runtime
  timeout           = local.ssm_housekeeper.lambda_timeout
  tags              = merge(local.tags, var.lambda_tags)
  memory_size       = local.ssm_housekeeper.lambda_memory_size
  architectures     = [var.lambda_architecture]

  environment {
    variables = {
      ENVIRONMENT                              = var.prefix
      LOG_LEVEL                                = var.log_level
      SSM_CLEANUP_CONFIG                       = jsonencode(local.ssm_housekeeper.config)
      POWERTOOLS_SERVICE_NAME                  = "ssm-housekeeper"
      POWERTOOLS_TRACE_ENABLED                 = var.tracing_config.mode != null ? true : false
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.tracing_config.capture_http_requests
      POWERTOOLS_TRACER_CAPTURE_ERROR          = var.tracing_config.capture_error
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

resource "aws_cloudwatch_log_group" "ssm_housekeeper" {
  name              = "/aws/lambda/${aws_lambda_function.ssm_housekeeper.function_name}"
  retention_in_days = var.logging_retention_in_days
  kms_key_id        = var.logging_kms_key_id
  tags              = var.tags
}

resource "aws_cloudwatch_event_rule" "ssm_housekeeper" {
  name                = "${var.prefix}-ssm-housekeeper"
  schedule_expression = local.ssm_housekeeper.schedule_expression
  tags                = var.tags
  state               = local.ssm_housekeeper.state
}

resource "aws_cloudwatch_event_target" "ssm_housekeeper" {
  rule = aws_cloudwatch_event_rule.ssm_housekeeper.name
  arn  = aws_lambda_function.ssm_housekeeper.arn
}

resource "aws_lambda_permission" "ssm_housekeeper" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ssm_housekeeper.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ssm_housekeeper.arn
}

resource "aws_iam_role" "ssm_housekeeper" {
  name                 = "${var.prefix}-ssm-hk-lambda"
  description          = "Lambda role for SSM Housekeeper (${var.prefix})"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}

resource "aws_iam_role_policy" "ssm_housekeeper" {
  name = "lambda-ssm"
  role = aws_iam_role.ssm_housekeeper.name
  policy = templatefile("${path.module}/policies/lambda-ssm-housekeeper.json", {
    ssm_token_path = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.token_path}"
  })
}

resource "aws_iam_role_policy" "ssm_housekeeper_logging" {
  name = "lambda-logging"
  role = aws_iam_role.ssm_housekeeper.name
  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.ssm_housekeeper.arn
  })
}

resource "aws_iam_role_policy_attachment" "ssm_housekeeper_vpc_execution_role" {
  count      = length(var.lambda_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.ssm_housekeeper.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "ssm_housekeeper_xray" {
  count  = var.tracing_config.mode != null ? 1 : 0
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.ssm_housekeeper.name
}
