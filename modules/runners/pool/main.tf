resource "aws_lambda_function" "pool" {

  s3_bucket                      = var.config.lambda.s3_bucket != null ? var.config.lambda.s3_bucket : null
  s3_key                         = var.config.lambda.s3_key != null ? var.config.lambda.s3_key : null
  s3_object_version              = var.config.lambda.s3_object_version != null ? var.config.lambda.s3_object_version : null
  filename                       = var.config.lambda.s3_bucket == null ? var.config.lambda.zip : null
  source_code_hash               = var.config.lambda.s3_bucket == null ? filebase64sha256(var.config.lambda.zip) : null
  function_name                  = "${var.config.prefix}-pool"
  role                           = aws_iam_role.pool.arn
  handler                        = "index.adjustPool"
  architectures                  = [var.config.lambda.architecture]
  runtime                        = var.config.lambda.runtime
  timeout                        = var.config.lambda.timeout
  reserved_concurrent_executions = var.config.lambda.reserved_concurrent_executions
  memory_size                    = var.config.lambda.memory_size
  tags                           = merge(var.config.tags, var.config.lambda_tags)

  environment {
    variables = {
      AMI_ID_SSM_PARAMETER_NAME                = var.config.ami_id_ssm_parameter_name
      DISABLE_RUNNER_AUTOUPDATE                = var.config.runner.disable_runner_autoupdate
      ENABLE_EPHEMERAL_RUNNERS                 = var.config.runner.ephemeral
      ENABLE_JIT_CONFIG                        = var.config.runner.enable_jit_config
      ENVIRONMENT                              = var.config.prefix
      GHES_URL                                 = var.config.ghes.url
      INSTANCE_ALLOCATION_STRATEGY             = var.config.instance_allocation_strategy
      INSTANCE_MAX_SPOT_PRICE                  = var.config.instance_max_spot_price
      INSTANCE_TARGET_CAPACITY_TYPE            = var.config.instance_target_capacity_type
      INSTANCE_TYPES                           = join(",", var.config.instance_types)
      LAUNCH_TEMPLATE_NAME                     = var.config.runner.launch_template.name
      LOG_LEVEL                                = var.config.lambda.log_level
      NODE_TLS_REJECT_UNAUTHORIZED             = var.config.ghes.url != null && !var.config.ghes.ssl_verify ? 0 : 1
      PARAMETER_GITHUB_APP_ID_NAME             = var.config.github_app_parameters.id.name
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME     = var.config.github_app_parameters.key_base64.name
      POWERTOOLS_LOGGER_LOG_EVENT              = var.config.lambda.log_level == "debug" ? "true" : "false"
      RUNNER_BOOT_TIME_IN_MINUTES              = var.config.runner.boot_time_in_minutes
      RUNNER_LABELS                            = lower(join(",", var.config.runner.labels))
      RUNNER_GROUP_NAME                        = var.config.runner.group_name
      RUNNER_NAME_PREFIX                       = var.config.runner.name_prefix
      RUNNER_OWNER                             = var.config.runner.pool_owner
      SSM_TOKEN_PATH                           = var.config.ssm_token_path
      SSM_CONFIG_PATH                          = var.config.ssm_config_path
      SUBNET_IDS                               = join(",", var.config.subnet_ids)
      POWERTOOLS_SERVICE_NAME                  = "runners-pool"
      POWERTOOLS_TRACE_ENABLED                 = var.tracing_config.mode != null ? true : false
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.tracing_config.capture_http_requests
      POWERTOOLS_TRACER_CAPTURE_ERROR          = var.tracing_config.capture_error
      ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS     = jsonencode(var.config.runner.enable_on_demand_failover_for_errors)
    }
  }

  dynamic "vpc_config" {
    for_each = var.config.lambda.subnet_ids != null && var.config.lambda.security_group_ids != null ? [true] : []
    content {
      security_group_ids = var.config.lambda.security_group_ids
      subnet_ids         = var.config.lambda.subnet_ids
    }
  }

  dynamic "tracing_config" {
    for_each = var.tracing_config.mode != null ? [true] : []
    content {
      mode = var.tracing_config.mode
    }
  }
}

resource "aws_cloudwatch_log_group" "pool" {
  name              = "/aws/lambda/${aws_lambda_function.pool.function_name}"
  retention_in_days = var.config.lambda.logging_retention_in_days
  kms_key_id        = var.config.lambda.logging_kms_key_id
  tags              = var.config.tags
}

resource "aws_iam_role" "pool" {
  name                 = "${var.config.prefix}-action-pool-lambda-role"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = var.config.role_path
  permissions_boundary = var.config.role_permissions_boundary
  tags                 = var.config.tags
}

resource "aws_iam_role_policy" "pool" {
  name = "pool-policy"
  role = aws_iam_role.pool.name
  policy = templatefile("${path.module}/policies/lambda-pool.json", {
    arn_ssm_parameters_path_config = var.config.arn_ssm_parameters_path_config
    arn_runner_instance_role       = var.config.runner.role.arn
    github_app_id_arn              = var.config.github_app_parameters.id.arn
    github_app_key_base64_arn      = var.config.github_app_parameters.key_base64.arn
    kms_key_arn                    = var.config.kms_key_arn
    ami_kms_key_arn                = var.config.ami_kms_key_arn
  })
}

resource "aws_iam_role_policy" "pool_logging" {
  name = "logging-policy"
  role = aws_iam_role.pool.name
  policy = templatefile("${path.module}/../policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.pool.arn
  })
}

resource "aws_iam_role_policy_attachment" "pool_vpc_execution_role" {
  count      = length(var.config.lambda.subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.pool.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
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

resource "aws_iam_role_policy_attachment" "ami_id_ssm_parameter_read" {
  count      = var.config.ami_id_ssm_parameter_name != null ? 1 : 0
  role       = aws_iam_role.pool.name
  policy_arn = var.config.ami_id_ssm_parameter_read_policy_arn
}

# lambda xray policy
data "aws_iam_policy_document" "lambda_xray" {
  count = var.tracing_config.mode != null ? 1 : 0
  statement {
    actions = [
      "xray:BatchGetTraces",
      "xray:GetTraceSummaries",
      "xray:PutTelemetryRecords",
      "xray:PutTraceSegments"
    ]
    effect = "Allow"
    resources = [
      "*"
    ]
    sid = "AllowXRay"
  }
}

resource "aws_iam_role_policy" "pool_xray" {
  count  = var.tracing_config.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.pool.name
}

resource "aws_scheduler_schedule_group" "pool" {
  name_prefix = "${var.config.prefix}-pool"

  tags = var.config.tags
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    sid     = "ScheduleGroupAssumeRole"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [aws_scheduler_schedule_group.pool.arn]
    }
  }
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    sid       = "InvokePoolLambda"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.pool.arn]
  }
}

resource "aws_iam_role" "scheduler" {
  name_prefix = "${var.config.prefix}-pool"

  path                 = var.config.role_path
  permissions_boundary = var.config.role_permissions_boundary

  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json

  inline_policy {
    name   = "terraform"
    policy = data.aws_iam_policy_document.scheduler.json
  }

  tags = var.config.tags
}

resource "aws_scheduler_schedule" "pool" {
  for_each = { for i, v in var.config.pool : i => v }

  name       = "${var.config.prefix}-pool-${each.key}-rule"
  group_name = aws_scheduler_schedule_group.pool.name

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = each.value.schedule_expression
  schedule_expression_timezone = each.value.schedule_expression_timezone

  target {
    arn      = aws_lambda_function.pool.arn
    role_arn = aws_iam_role.scheduler.arn
    input = jsonencode({
      poolSize = each.value.size
    })
  }
}
