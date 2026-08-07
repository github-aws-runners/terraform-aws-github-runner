locals {
  ssm_housekeeper = {
    schedule_expression = var.ssm.housekeeper.schedule_expression
    state               = var.ssm.housekeeper.state
    lambda_timeout      = var.ssm.housekeeper.lambda.timeout
    lambda_memory_size  = var.ssm.housekeeper.lambda.memory_size
    config = {
      tokenPath      = var.ssm.housekeeper.config.tokenPath == null ? local.token_path : var.ssm.housekeeper.config.tokenPath
      minimumDaysOld = var.ssm.housekeeper.config.minimumDaysOld
      dryRun         = var.ssm.housekeeper.config.dryRun
    }
  }
}

resource "aws_lambda_function" "ssm_housekeeper" {
  s3_bucket         = var.lambda.s3.bucket != null ? var.lambda.s3.bucket : null
  s3_key            = var.lambda.s3.key != null ? var.lambda.s3.key : null
  s3_object_version = var.lambda.s3.object_version != null ? var.lambda.s3.object_version : null
  filename          = var.lambda.s3.bucket == null ? local.lambda_zip : null
  source_code_hash  = var.lambda.s3.bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name     = "${var.prefix}-ssm-housekeeper"
  role              = aws_iam_role.ssm_housekeeper.arn
  handler           = "index.ssmHousekeeper"
  runtime           = var.lambda.runtime
  timeout           = local.ssm_housekeeper.lambda_timeout
  tags              = local.ssm_housekeeper_lambda_tags
  memory_size       = local.ssm_housekeeper.lambda_memory_size
  architectures     = [var.lambda.architecture]

  environment {
    variables = {
      ENVIRONMENT                              = var.prefix
      LOG_LEVEL                                = upper(var.observability.logs.level)
      SSM_CLEANUP_CONFIG                       = jsonencode(local.ssm_housekeeper.config)
      POWERTOOLS_SERVICE_NAME                  = "${var.prefix}-ssm-housekeeper"
      POWERTOOLS_TRACE_ENABLED                 = var.observability.tracing.mode != null ? true : false
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.observability.tracing.capture_http_requests
      POWERTOOLS_TRACER_CAPTURE_ERROR          = var.observability.tracing.capture_error
    }
  }

  dynamic "vpc_config" {
    for_each = var.lambda.subnet_ids != null && var.lambda.security_group_ids != null ? [true] : []
    content {
      security_group_ids = var.lambda.security_group_ids
      subnet_ids         = var.lambda.subnet_ids
    }
  }

  dynamic "tracing_config" {
    for_each = var.observability.tracing.mode != null ? [true] : []
    content {
      mode = var.observability.tracing.mode
    }
  }
}

resource "aws_cloudwatch_log_group" "ssm_housekeeper" {
  name              = "/aws/lambda/${aws_lambda_function.ssm_housekeeper.function_name}"
  retention_in_days = var.observability.logs.retention_in_days
  kms_key_id        = var.observability.logs.kms_key_id
  log_group_class   = var.observability.logs.class
  tags              = local.ssm_housekeeper_log_tags
}

resource "aws_cloudwatch_event_rule" "ssm_housekeeper" {
  name                = "${var.prefix}-ssm-housekeeper"
  schedule_expression = local.ssm_housekeeper.schedule_expression
  tags                = local.ssm_housekeeper_tags
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
  name                 = "${substr("${var.prefix}-ssm-hk-lambda", 0, 54)}-${substr(md5("${var.prefix}-ssm-hk-lambda"), 0, 8)}"
  description          = "Lambda role for SSM Housekeeper (${var.prefix})"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.lambda_role_path
  permissions_boundary = var.lambda.role.permissions_boundary
  tags                 = local.ssm_housekeeper_tags
}

resource "aws_iam_role_policy" "ssm_housekeeper" {
  name   = "ssm-policy"
  role   = aws_iam_role.ssm_housekeeper.name
  policy = data.aws_iam_policy_document.ssm_housekeeper.json
}

resource "aws_iam_role_policy" "ssm_housekeeper_logging" {
  name   = "logging-policy"
  role   = aws_iam_role.ssm_housekeeper.name
  policy = data.aws_iam_policy_document.ssm_housekeeper_logging.json
}

resource "aws_iam_role_policy_attachment" "ssm_housekeeper_vpc_execution_role" {
  count      = length(var.lambda.subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.ssm_housekeeper.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "ssm_housekeeper_xray" {
  count  = var.observability.tracing.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.ssm_housekeeper.name
}
