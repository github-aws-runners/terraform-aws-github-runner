locals {
  name = "${var.config.prefix}-registration-janitor"
}

module "lambda" {
  source = "../lambda"
  lambda = {
    prefix                    = var.config.prefix
    name                      = "registration-janitor"
    handler                   = "index.registrationJanitor"
    zip                       = var.config.s3_bucket == null ? coalesce(var.config.zip, "${path.module}/../../lambdas/functions/termination-watcher/termination-watcher.zip") : null
    s3_bucket                 = var.config.s3_bucket
    s3_key                    = var.config.s3_key
    s3_object_version         = var.config.s3_object_version
    architecture              = var.config.architecture
    runtime                   = var.config.runtime
    memory_size               = var.config.memory_size
    timeout                   = var.config.timeout
    log_level                 = var.config.log_level
    logging_retention_in_days = var.config.logging_retention_in_days
    logging_kms_key_id        = var.config.logging_kms_key_id
    role_path                 = var.config.role_path
    role_permissions_boundary = var.config.role_permissions_boundary
    tags                      = var.config.tags
    environment_variables = merge({
      PARAMETER_GITHUB_APP_ID_NAME         = var.config.github_app_parameters.id.name
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME = var.config.github_app_parameters.key_base64.name
      REGISTRATION_JANITOR_QUEUE_URL       = aws_sqs_queue.confirmation.url
      REGISTRATION_JANITOR_CONFIG = jsonencode({
        organization     = var.config.organization
        runnerGroupIds   = var.config.runner_group_ids
        runnerNamePrefix = var.config.runner_name_prefix
        computeProvider  = local.compute_provider
        dryRun           = var.config.dry_run
        maxCandidates    = var.config.max_candidates
        ghesApiUrl       = var.config.ghes_api_url
      })
      }, var.config.github_app_parameters.additional_apps_manifest == null ? {} : {
      PARAMETER_GITHUB_APPS_MANIFEST_NAME = var.config.github_app_parameters.additional_apps_manifest.name
    })
  }
}

resource "aws_sqs_queue" "dead_letter" {
  name                      = "${local.name}-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
  tags                      = var.config.tags
}

resource "aws_sqs_queue" "confirmation" {
  name                       = "${local.name}-confirmation"
  delay_seconds              = 900
  visibility_timeout_seconds = var.config.timeout * 6
  message_retention_seconds  = 86400
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter.arn
    maxReceiveCount     = 3
  })
  tags = var.config.tags
}

data "aws_iam_policy_document" "cleanup" {
  statement {
    sid       = "ReadGitHubCredentials"
    actions   = concat(["ssm:GetParameters"], var.config.github_app_parameters.additional_apps_manifest == null ? [] : ["ssm:GetParameter"])
    resources = concat([var.config.github_app_parameters.id.arn, var.config.github_app_parameters.key_base64.arn], var.config.github_app_parameters.additional_apps_manifest == null ? [] : [var.config.github_app_parameters.additional_apps_manifest.arn], var.config.github_app_parameters.additional_app_parameter_arns)
  }
  statement {
    sid       = "ConfirmRegistrations"
    actions   = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.confirmation.arn]
  }
  dynamic "statement" {
    for_each = var.config.github_app_kms_key_arn == null ? [] : [var.config.github_app_kms_key_arn]
    content {
      sid       = "DecryptGitHubCredentials"
      actions   = ["kms:Decrypt"]
      resources = [statement.value]
    }
  }
}

resource "aws_iam_role_policy" "cleanup" {
  name   = "registration-janitor"
  role   = module.lambda.lambda.role.name
  policy = data.aws_iam_policy_document.cleanup.json
}

resource "aws_lambda_event_source_mapping" "confirmation" {
  event_source_arn        = aws_sqs_queue.confirmation.arn
  function_name           = module.lambda.lambda.function.arn
  batch_size              = 10
  function_response_types = ["ReportBatchItemFailures"]
  depends_on              = [aws_iam_role_policy.cleanup, aws_iam_role_policy.compute]
}

resource "aws_cloudwatch_event_rule" "schedule" {
  name                = local.name
  schedule_expression = var.config.schedule_expression
  state               = var.config.schedule_state
  tags                = var.config.tags
}

resource "aws_cloudwatch_event_target" "schedule" {
  rule = aws_cloudwatch_event_rule.schedule.name
  arn  = module.lambda.lambda.function.arn
}

resource "aws_lambda_permission" "schedule" {
  action        = "lambda:InvokeFunction"
  function_name = module.lambda.lambda.function.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.schedule.arn
}
