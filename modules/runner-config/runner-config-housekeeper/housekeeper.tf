locals {
  vpc_enabled = (
    length(var.config.lambda.vpc.subnet_ids) > 0 &&
    length(var.config.lambda.vpc.security_group_ids) > 0
  )

  cleanup_config = var.storage_provider.aws.ssm == null ? null : {
    tokenPath      = var.storage_provider.aws.ssm.cleanup.token_path
    minimumDaysOld = var.storage_provider.aws.ssm.cleanup.minimum_days_old
    dryRun         = var.storage_provider.aws.ssm.cleanup.dry_run
  }

  common_environment_variables = {
    ENVIRONMENT                              = var.config.prefix
    LOG_LEVEL                                = upper(var.config.observability.logs.level)
    POWERTOOLS_SERVICE_NAME                  = "${var.config.prefix}-ssm-housekeeper"
    POWERTOOLS_TRACE_ENABLED                 = var.config.observability.tracing.mode != null
    POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.config.observability.tracing.capture_http_requests
    POWERTOOLS_TRACER_CAPTURE_ERROR          = var.config.observability.tracing.capture_error
  }

  environment_variables = merge(
    local.common_environment_variables,
    local.ssm_environment_variables,
  )

}

resource "aws_lambda_function" "housekeeper" {
  s3_bucket         = var.config.lambda.artifact.s3.bucket
  s3_key            = var.config.lambda.artifact.s3.key
  s3_object_version = var.config.lambda.artifact.s3.object_version
  filename          = var.config.lambda.artifact.s3.bucket == null ? var.config.lambda.artifact.zip : null
  source_code_hash  = var.config.lambda.artifact.s3.bucket == null ? filebase64sha256(var.config.lambda.artifact.zip) : null
  function_name     = "${var.config.prefix}-ssm-housekeeper"
  role              = aws_iam_role.housekeeper.arn
  handler           = "index.runnerConfigHousekeeper"
  runtime           = var.config.lambda.runtime
  timeout           = var.config.lambda.timeout
  tags              = var.config.tags.lambda
  memory_size       = var.config.lambda.memory_size
  architectures     = [var.config.lambda.architecture]

  environment {
    variables = local.environment_variables
  }

  dynamic "vpc_config" {
    for_each = local.vpc_enabled ? [true] : []

    content {
      security_group_ids = var.config.lambda.vpc.security_group_ids
      subnet_ids         = var.config.lambda.vpc.subnet_ids
    }
  }

  dynamic "tracing_config" {
    for_each = var.config.observability.tracing.mode != null ? [true] : []

    content {
      mode = var.config.observability.tracing.mode
    }
  }
}

resource "aws_cloudwatch_log_group" "housekeeper" {
  name              = "/aws/lambda/${aws_lambda_function.housekeeper.function_name}"
  retention_in_days = var.config.observability.logs.retention_in_days
  kms_key_id        = var.config.observability.logs.kms_key_id
  log_group_class   = var.config.observability.logs.class
  tags              = var.config.tags.log_group
}

resource "aws_cloudwatch_event_rule" "housekeeper" {
  name                = "${var.config.prefix}-ssm-housekeeper"
  schedule_expression = var.config.schedule.expression
  state               = var.config.schedule.state
  tags                = var.config.tags.resources
}

resource "aws_cloudwatch_event_target" "housekeeper" {
  rule = aws_cloudwatch_event_rule.housekeeper.name
  arn  = aws_lambda_function.housekeeper.arn
}

resource "aws_lambda_permission" "housekeeper" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.housekeeper.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.housekeeper.arn
}

resource "aws_iam_role" "housekeeper" {
  name                 = "${substr("${var.config.prefix}-ssm-hk-lambda", 0, 54)}-${substr(md5("${var.config.prefix}-ssm-hk-lambda"), 0, 8)}"
  description          = "Lambda role for Runner Config Housekeeper (${var.config.prefix})"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role.json
  path                 = var.config.lambda.role.path
  permissions_boundary = var.config.lambda.role.permissions_boundary
  tags                 = var.config.tags.resources
}

resource "aws_iam_role_policy" "housekeeper" {
  name   = "housekeeper-policy"
  role   = aws_iam_role.housekeeper.name
  policy = data.aws_iam_policy_document.housekeeper.json
}

resource "aws_iam_role_policy" "housekeeper_logging" {
  name   = "logging-policy"
  role   = aws_iam_role.housekeeper.name
  policy = data.aws_iam_policy_document.housekeeper_logging.json
}

resource "aws_iam_role_policy_attachment" "housekeeper_vpc_execution_role" {
  count      = local.vpc_enabled ? 1 : 0
  role       = aws_iam_role.housekeeper.name
  policy_arn = "arn:${var.config.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "housekeeper_xray" {
  count  = var.config.observability.tracing.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.housekeeper.name
}
