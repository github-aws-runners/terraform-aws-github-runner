locals {
  ssm_housekeeper = {
    create              = var.ssm_housekeeper.create
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
  count = local.ssm_housekeeper.create ? 1 : 0

  s3_bucket         = var.lambda_s3_bucket != null ? var.lambda_s3_bucket : null
  s3_key            = var.runners_lambda_s3_key != null ? var.runners_lambda_s3_key : null
  s3_object_version = var.runners_lambda_s3_object_version != null ? var.runners_lambda_s3_object_version : null
  filename          = var.lambda_s3_bucket == null ? local.lambda_zip : null
  source_code_hash  = var.lambda_s3_bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name     = "${var.prefix}-ssm-housekeeper"
  role              = aws_iam_role.ssm_housekeeper[0].arn
  handler           = "index.ssmHousekeeper"
  runtime           = var.lambda_runtime
  timeout           = local.ssm_housekeeper.lambda_timeout
  tags              = merge(local.tags, var.lambda_tags)
  memory_size       = local.ssm_housekeeper.lambda_memory_size
  architectures     = [var.lambda_architecture]

  environment {
    variables = {
      ENVIRONMENT                              = var.prefix
      LOG_LEVEL                                = upper(var.log_level)
      SSM_CLEANUP_CONFIG                       = jsonencode(local.ssm_housekeeper.config)
      POWERTOOLS_SERVICE_NAME                  = "${var.prefix}-ssm-housekeeper"
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
  count = local.ssm_housekeeper.create ? 1 : 0

  name              = "/aws/lambda/${aws_lambda_function.ssm_housekeeper[0].function_name}"
  retention_in_days = var.logging_retention_in_days
  kms_key_id        = var.logging_kms_key_id
  log_group_class   = var.log_class
  tags              = var.tags
}

resource "aws_cloudwatch_event_rule" "ssm_housekeeper" {
  count = local.ssm_housekeeper.create ? 1 : 0

  name                = "${var.prefix}-ssm-housekeeper"
  schedule_expression = local.ssm_housekeeper.schedule_expression
  tags                = var.tags
  state               = local.ssm_housekeeper.state
}

resource "aws_cloudwatch_event_target" "ssm_housekeeper" {
  count = local.ssm_housekeeper.create ? 1 : 0

  rule = aws_cloudwatch_event_rule.ssm_housekeeper[0].name
  arn  = aws_lambda_function.ssm_housekeeper[0].arn
}

resource "aws_lambda_permission" "ssm_housekeeper" {
  count = local.ssm_housekeeper.create ? 1 : 0

  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ssm_housekeeper[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ssm_housekeeper[0].arn
}

resource "aws_iam_role" "ssm_housekeeper" {
  count = local.ssm_housekeeper.create ? 1 : 0

  name                 = "${substr("${var.prefix}-ssm-hk-lambda", 0, 54)}-${substr(md5("${var.prefix}-ssm-hk-lambda"), 0, 8)}"
  description          = "Lambda role for SSM Housekeeper (${var.prefix})"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}

resource "aws_iam_role_policy" "ssm_housekeeper" {
  count = local.ssm_housekeeper.create ? 1 : 0

  name = "ssm-policy"
  role = aws_iam_role.ssm_housekeeper[0].name
  policy = templatefile("${path.module}/policies/lambda-ssm-housekeeper.json", {
    ssm_token_path = "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.token_path}"
  })
}

resource "aws_iam_role_policy" "ssm_housekeeper_logging" {
  count = local.ssm_housekeeper.create ? 1 : 0

  name = "logging-policy"
  role = aws_iam_role.ssm_housekeeper[0].name
  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.ssm_housekeeper[0].arn
  })
}

resource "aws_iam_role_policy_attachment" "ssm_housekeeper_vpc_execution_role" {
  count      = local.ssm_housekeeper.create && length(var.lambda_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.ssm_housekeeper[0].name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "ssm_housekeeper_xray" {
  count  = local.ssm_housekeeper.create && var.tracing_config.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.ssm_housekeeper[0].name
}
