resource "aws_lambda_function" "runner_monitor" {
  s3_bucket                      = var.lambda_s3_bucket != null ? var.lambda_s3_bucket : null
  s3_key                         = var.runners_lambda_s3_key != null ? var.runners_lambda_s3_key : null
  s3_object_version              = var.runners_lambda_s3_object_version != null ? var.runners_lambda_s3_object_version : null
  filename                       = var.lambda_s3_bucket == null ? local.monitor_lambda_zip : null
  source_code_hash               = var.lambda_s3_bucket == null ? filebase64sha256(local.monitor_lambda_zip) : null
  function_name                  = "${var.prefix}-scale-up"
  role                           = aws_iam_role.runner_monitor.arn
  handler                        = "lambda_function.lambda_handler"
  runtime                        = var.lambda_runtime
  timeout                        = 180
  memory_size                    = 512
  tags                           = local.tags
  architectures                  = [var.lambda_architecture]

  environment {
    variables = {
      PARAMETER_GITHUB_APP_ID_NAME         = var.github_app_parameters.id.name
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME = var.github_app_parameters.key_base64.name
      SQS_QUEUE_NAME = var.var.sqs_workflow_job_queue.name
    }
  }

  dynamic "vpc_config" {
    for_each = var.lambda_subnet_ids != null && var.lambda_security_group_ids != null ? [true] : []
    content {
      security_group_ids = var.lambda_security_group_ids
      subnet_ids         = var.lambda_subnet_ids
    }
  }
}

resource "aws_cloudwatch_log_group" "runner_monitor" {
  name              = "/aws/lambda/${aws_lambda_function.runner_monitor.function_name}"
  retention_in_days = var.logging_retention_in_days
  kms_key_id        = var.logging_kms_key_id
  tags              = var.tags
}


resource "aws_iam_role" "runner_monitor" {
  name                 = "${var.prefix}-action-runner-monitor-role"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}
# working
resource "aws_iam_role_policy" "runner_monitor" {
  name = "${var.prefix}-lambda-runner-monitor-policy"
  role = aws_iam_role.runner_monitor.name
  policy = templatefile("${path.module}/policies/lambda-runner-monitor.json", {
    arn_runner_instance_role  = aws_iam_role.runner.arn
    sqs_arn                   = var.var.sqs_workflow_job_queue.arn
    github_app_id_arn         = var.github_app_parameters.id.arn
    github_app_key_base64_arn = var.github_app_parameters.key_base64.arn
    kms_key_arn               = local.kms_key_arn
  })
}


resource "aws_iam_role_policy" "runner_monitor_logging" {
  name = "${var.prefix}-lambda-logging"
  role = aws_iam_role.runner_monitor.name
  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.runner_monitor.arn
  })
}


resource "aws_iam_role_policy_attachment" "runner_monitor_vpc_execution_role" {
  count      = length(var.lambda_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.runner_monitor.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "ami_id_ssm_parameter_read" {
  count  = var.ami_id_ssm_parameter_name != null ? 1 : 0
  name   = "${var.prefix}-ami-id-ssm-parameter-read"
  role   = aws_iam_role.runner_monitor.name
  policy = <<-JSON
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "ssm:GetParameter"
          ],
          "Resource": [
            "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${trimprefix(var.ami_id_ssm_parameter_name, "/")}"
          ]
        }
      ]
    }
  JSON
}
