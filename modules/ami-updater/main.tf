locals {
  lambda_zip = "${path.module}/../../lambdas/functions/ami-updater/dist/ami-updater.zip"
  role_path  = var.role_path == null ? "/${var.prefix}/" : var.role_path
  tags = merge(
    {
      Environment = var.prefix
      Name        = "${var.prefix}-ami-updater"
    },
    var.tags
  )
}

resource "aws_lambda_function" "ami_updater" {
  filename         = local.lambda_zip
  source_code_hash = filebase64sha256(local.lambda_zip)
  function_name    = "${var.prefix}-ami-updater"
  role             = aws_iam_role.ami_updater.arn
  handler          = "index.handler"
  runtime          = var.lambda_runtime
  timeout          = var.lambda_timeout
  memory_size      = var.lambda_memory_size
  architectures    = [var.lambda_architecture]
  tags             = local.tags

  environment {
    variables = {
      LOG_LEVEL               = var.log_level
      DRY_RUN                 = tostring(var.config.dry_run)
      POWERTOOLS_SERVICE_NAME = "ami-updater"
      SSM_PARAMETER_NAME      = var.ssm_parameter_name
      AMI_FILTER              = jsonencode(var.config.ami_filter)
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

resource "aws_cloudwatch_log_group" "ami_updater" {
  name              = "/aws/lambda/${aws_lambda_function.ami_updater.function_name}"
  retention_in_days = var.logging_retention_in_days
  kms_key_id        = var.logging_kms_key_id
  tags              = var.tags
}

resource "aws_cloudwatch_event_rule" "ami_updater" {
  name                = "${var.prefix}-ami-updater"
  description         = "Trigger AMI updater Lambda function"
  schedule_expression = var.schedule_expression
  state               = var.state
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "ami_updater" {
  rule      = aws_cloudwatch_event_rule.ami_updater.name
  target_id = "TriggerAMIUpdaterLambda"
  arn       = aws_lambda_function.ami_updater.arn
}

resource "aws_lambda_permission" "ami_updater" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ami_updater.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ami_updater.arn
}

resource "aws_iam_role" "ami_updater" {
  name                 = "${var.prefix}-ami-updater"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role_policy.json
  path                 = local.role_path
  permissions_boundary = var.role_permissions_boundary
  tags                 = local.tags
}

resource "aws_iam_role_policy" "ami_updater" {
  name = "ami-updater-policy"
  role = aws_iam_role.ami_updater.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeImages"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:PutParameter",
          "ssm:GetParameter"
        ]
        Resource = "arn:${var.aws_partition}:ssm:*:*:parameter${var.ssm_parameter_name}"
      }
    ]
  })
}

resource "aws_iam_role_policy" "ami_updater_logging" {
  name = "logging-policy"
  role = aws_iam_role.ami_updater.name
  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {
    log_group_arn = aws_cloudwatch_log_group.ami_updater.arn
  })
}

resource "aws_iam_role_policy_attachment" "ami_updater_vpc_execution_role" {
  count      = length(var.lambda_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.ami_updater.name
  policy_arn = "arn:${var.aws_partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "ami_updater_xray" {
  count  = var.tracing_config.mode != null ? 1 : 0
  name   = "xray-policy"
  policy = data.aws_iam_policy_document.lambda_xray[0].json
  role   = aws_iam_role.ami_updater.name
}

resource "aws_ssm_parameter" "latest_ami_id" {
  name        = var.ssm_parameter_name
  description = "Latest AMI ID for GitHub runners"
  type        = "String"
  value       = "placeholder" # Will be updated by Lambda function
  tags        = var.tags
}
