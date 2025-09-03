resource "aws_cloudwatch_event_rule" "workflow_job" {
  name           = "${var.config.prefix}-workflow_job"
  description    = "Workflow job event rule for job queued."
  event_bus_name = aws_cloudwatch_event_bus.main.name
  tags           = var.config.tags

  event_pattern = <<EOF
{
  "detail-type": ["workflow_job"],
  "detail": {
    "action": ["queued"]
  }
}
EOF
}

resource "aws_cloudwatch_event_target" "dispatcher" {
  arn            = aws_lambda_function.dispatcher.arn
  rule           = aws_cloudwatch_event_rule.workflow_job.name
  event_bus_name = aws_cloudwatch_event_bus.main.name
}

resource "aws_lambda_function" "dispatcher" {
  s3_bucket         = var.config.lambda_s3_bucket != null ? var.config.lambda_s3_bucket : null
  s3_key            = var.config.lambda_s3_key != null ? var.config.lambda_s3_key : null
  s3_object_version = var.config.lambda_s3_object_version != null ? var.config.lambda_s3_object_version : null
  filename          = var.config.lambda_s3_bucket == null ? local.lambda_zip : null
  source_code_hash  = var.config.lambda_s3_bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name     = "${var.config.prefix}-dispatch-to-runner"
  role              = aws_iam_role.dispatcher_lambda.arn
  handler           = "index.dispatchToRunners"
  runtime           = var.config.lambda_runtime
  memory_size       = var.config.lambda_memory_size
  timeout           = var.config.lambda_timeout
  architectures     = [var.config.lambda_architecture]

  environment {
    variables = {
      for k, v in {
        LOG_LEVEL                                = var.config.log_level
        POWERTOOLS_LOGGER_LOG_EVENT              = var.config.log_level == "debug" ? "true" : "false"
        POWERTOOLS_SERVICE_NAME                  = "dispatcher"
        POWERTOOLS_TRACE_ENABLED                 = var.config.tracing_config.mode != null ? true : false
        POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = var.config.tracing_config.capture_http_requests
        POWERTOOLS_TRACER_CAPTURE_ERROR          = var.config.tracing_config.capture_error
        # Parameters required for lambda configuration
        PARAMETER_RUNNER_MATCHER_CONFIG_PATH = var.config.ssm_parameter_runner_matcher_config.name
        PARAMETER_RUNNER_MATCHER_VERSION     = var.config.ssm_parameter_runner_matcher_config.version # enforce cold start after Changes in SSM parameter
        REPOSITORY_ALLOW_LIST                = jsonencode(var.config.repository_white_list)
      } : k => v if v != null
    }
  }

  dynamic "vpc_config" {
    for_each = var.config.lambda_subnet_ids != null && var.config.lambda_security_group_ids != null ? [true] : []
    content {
      security_group_ids = var.config.lambda_security_group_ids
      subnet_ids         = var.config.lambda_subnet_ids
    }
  }

  tags = merge(var.config.tags, var.config.lambda_tags)

  dynamic "tracing_config" {
    for_each = var.config.tracing_config.mode != null ? [true] : []
    content {
      mode = var.config.tracing_config.mode
    }
  }
}

resource "aws_cloudwatch_log_group" "dispatcher" {
  name              = "/aws/lambda/${aws_lambda_function.dispatcher.function_name}"
  retention_in_days = var.config.logging_retention_in_days
  kms_key_id        = var.config.logging_kms_key_id
  tags              = var.config.tags
}

resource "aws_lambda_permission" "allow_cloudwatch_to_call_lambda" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.dispatcher.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.workflow_job.arn
}

resource "aws_iam_role" "dispatcher_lambda" {
  name                 = "${substr("${var.config.prefix}-dispatcher-lambda", 0, 54)}-${substr(md5("${var.config.prefix}-dispatcher-lambda"), 0, 8)}"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = var.config.role_path
  permissions_boundary = var.config.role_permissions_boundary
  tags                 = var.config.tags
}

resource "aws_iam_role_policy" "dispatcher_logging" {
  name = "logging-policy"
  role = aws_iam_role.dispatcher_lambda.name
  policy = templatefile("${path.module}/../policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.dispatcher.arn
  })
}

resource "aws_iam_role_policy_attachment" "dispatcher_vpc_execution_role" {
  count      = length(var.config.lambda_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.dispatcher_lambda.name
  policy_arn = "arn:${var.config.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "dispatcher_sqs" {
  name = "publish-sqs-policy"
  role = aws_iam_role.dispatcher_lambda.name

  policy = templatefile("${path.module}/../policies/lambda-publish-sqs-policy.json", {
    sqs_resource_arns = jsonencode(var.config.sqs_job_queues_arns)
  })
}

resource "aws_iam_role_policy" "dispatcher_kms" {
  name = "kms-policy"
  role = aws_iam_role.dispatcher_lambda.name

  policy = templatefile("${path.module}/../policies/lambda-kms.json", {
    kms_key_arn = var.config.kms_key_arn != null ? var.config.kms_key_arn : "arn:${var.config.aws_partition}:kms:::CMK_NOT_IN_USE"
  })
}

resource "aws_iam_role_policy" "dispatcher_ssm" {
  name = "publish-ssm-policy"
  role = aws_iam_role.dispatcher_lambda.name

  policy = templatefile("${path.module}/../policies/lambda-ssm.json", {
    resource_arns = jsonencode([var.config.ssm_parameter_runner_matcher_config.arn])
  })
}

resource "aws_iam_role_policy" "dispatcher_xray" {
  count  = var.config.tracing_config.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.dispatcher_lambda.name
}
