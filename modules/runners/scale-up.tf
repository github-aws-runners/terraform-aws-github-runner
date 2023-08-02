resource "aws_lambda_function" "scale_up" {
  s3_bucket                      = var.lambda_s3_bucket != null ? var.lambda_s3_bucket : null
  s3_key                         = var.runners_lambda_s3_key != null ? var.runners_lambda_s3_key : null
  s3_object_version              = var.runners_lambda_s3_object_version != null ? var.runners_lambda_s3_object_version : null
  filename                       = var.lambda_s3_bucket == null ? local.lambda_zip : null
  source_code_hash               = var.lambda_s3_bucket == null ? filebase64sha256(local.lambda_zip) : null
  function_name                  = "${var.prefix}-scale-up"
  role                           = aws_iam_role.scale_up.arn
  handler                        = "index.scaleUpHandler"
  runtime                        = var.lambda_runtime
  timeout                        = var.lambda_timeout_scale_up
  reserved_concurrent_executions = var.scale_up_reserved_concurrent_executions
  memory_size                    = 512
  tags                           = local.tags
  architectures                  = [var.lambda_architecture]

  environment {
    variables = {
      AMI_ID_SSM_PARAMETER_NAME            = var.ami_id_ssm_parameter_name
      DISABLE_RUNNER_AUTOUPDATE            = var.disable_runner_autoupdate
      ENABLE_EPHEMERAL_RUNNERS             = var.enable_ephemeral_runners
      ENABLE_JIT_CONFIG                    = var.enable_jit_config
      ENABLE_JOB_QUEUED_CHECK              = local.enable_job_queued_check
      ENABLE_ORGANIZATION_RUNNERS          = var.enable_organization_runners
      ENVIRONMENT                          = var.prefix
      GHES_URL                             = var.ghes_url
      INSTANCE_ALLOCATION_STRATEGY         = var.instance_allocation_strategy
      INSTANCE_MAX_SPOT_PRICE              = var.instance_max_spot_price
      INSTANCE_TARGET_CAPACITY_TYPE        = var.instance_target_capacity_type
      INSTANCE_TYPES                       = join(",", var.instance_types)
      LAUNCH_TEMPLATE_NAME                 = aws_launch_template.runner.name
      LOG_LEVEL                            = var.log_level
      MINIMUM_RUNNING_TIME_IN_MINUTES      = coalesce(var.minimum_running_time_in_minutes, local.min_runtime_defaults[var.runner_os])
      NODE_TLS_REJECT_UNAUTHORIZED         = var.ghes_url != null && !var.ghes_ssl_verify ? 0 : 1
      PARAMETER_GITHUB_APP_ID_NAME         = var.github_app_parameters.id.name
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME = var.github_app_parameters.key_base64.name
      POWERTOOLS_LOGGER_LOG_EVENT          = var.log_level == "debug" ? "true" : "false"
      RUNNER_LABELS                        = lower(var.runner_labels)
      RUNNER_GROUP_NAME                    = var.runner_group_name
      RUNNER_NAME_PREFIX                   = var.runner_name_prefix
      RUNNERS_MAXIMUM_COUNT                = var.runners_maximum_count
      SERVICE_NAME                         = "runners-scale-up"
      SSM_TOKEN_PATH                       = "${var.ssm_paths.root}/${var.ssm_paths.tokens}"
      SSM_CONFIG_PATH                      = "${var.ssm_paths.root}/${var.ssm_paths.config}"
      SUBNET_IDS                           = join(",", var.subnet_ids)
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
    for_each = var.lambda_tracing_mode != null ? [true] : []
    content {
      mode = var.lambda_tracing_mode
    }
  }
}

resource "aws_cloudwatch_log_group" "scale_up" {
  name              = "/aws/lambda/${aws_lambda_function.scale_up.function_name}"
  retention_in_days = var.logging_retention_in_days
  kms_key_id        = var.logging_kms_key_id
  tags              = var.tags
}

resource "aws_lambda_event_source_mapping" "scale_up" {
  event_source_arn = var.sqs_build_queue.arn
  function_name    = aws_lambda_function.scale_up.arn
  batch_size       = 1
}

resource "aws_lambda_permission" "scale_runners_lambda" {
  statement_id  = "AllowExecutionFromSQS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scale_up.function_name
  principal     = "sqs.amazonaws.com"
  source_arn    = var.sqs_build_queue.arn
}

resource "aws_iam_role" "scale_up" {
  name                 = "${var.prefix}-action-scale-up-lambda-role"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}

resource "aws_iam_role_policy" "scale_up" {
  name = "${var.prefix}-lambda-scale-up-policy"
  role = aws_iam_role.scale_up.name
  policy = templatefile("${path.module}/policies/lambda-scale-up.json", {
    arn_runner_instance_role  = aws_iam_role.runner.arn
    sqs_arn                   = var.sqs_build_queue.arn
    github_app_id_arn         = var.github_app_parameters.id.arn
    github_app_key_base64_arn = var.github_app_parameters.key_base64.arn
    ssm_config_path           = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_paths.root}/${var.ssm_paths.config}"
    kms_key_arn               = local.kms_key_arn
    ami_kms_key_arn           = local.ami_kms_key_arn
  })
}


resource "aws_iam_role_policy" "scale_up_logging" {
  name = "${var.prefix}-lambda-logging"
  role = aws_iam_role.scale_up.name
  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.scale_up.arn
  })
}

resource "aws_iam_role_policy" "service_linked_role" {
  count  = var.create_service_linked_role_spot ? 1 : 0
  name   = "${var.prefix}-service_linked_role"
  role   = aws_iam_role.scale_up.name
  policy = templatefile("${path.module}/policies/service-linked-role-create-policy.json", { aws_partition = var.aws_partition })
}

resource "aws_iam_role_policy_attachment" "scale_up_vpc_execution_role" {
  count      = length(var.lambda_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.scale_up.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "ami_id_ssm_parameter_read" {
  count      = var.ami_id_ssm_parameter_name != null ? 1 : 0
  role       = aws_iam_role.scale_up.name
  policy_arn = aws_iam_policy.ami_id_ssm_parameter_read[0].arn
}

resource "aws_iam_role_policy" "scale_up_xray" {
  count  = var.lambda_tracing_mode != null ? 1 : 0
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.scale_up.name
}
