locals {
  webhook_endpoint = "webhook"
}

resource "aws_apigatewayv2_api" "webhook" {
  name          = "${var.environment}-github-action-webhook"
  protocol_type = "HTTP"
  tags          = var.tags
}

resource "aws_apigatewayv2_route" "webhook" {
  api_id    = aws_apigatewayv2_api.webhook.id
  route_key = "POST /${local.webhook_endpoint}"
  target    = "integrations/${aws_apigatewayv2_integration.webhook.id}"
}

resource "aws_apigatewayv2_stage" "webhook" {
  lifecycle {
    ignore_changes = [
      // see bug https://github.com/terraform-providers/terraform-provider-aws/issues/12893
      default_route_settings
    ]
  }

  api_id      = aws_apigatewayv2_api.webhook.id
  name        = "$default"
  auto_deploy = true
  tags        = var.tags
}

resource "aws_apigatewayv2_integration" "webhook" {
  api_id           = aws_apigatewayv2_api.webhook.id
  integration_type = "AWS_PROXY"

  connection_type    = "INTERNET"
  description        = "GitHub App webhook for receiving build events."
  integration_method = "POST"
  integration_uri    = aws_lambda_function.webhook.invoke_arn
}


resource "aws_lambda_function" "webhook" {
  filename         = "${path.module}/lambdas/webhook/webhook.zip"
  source_code_hash = filebase64sha256("${path.module}/lambdas/webhook/webhook.zip")
  function_name    = "${var.environment}-webhook"
  role             = aws_iam_role.webhook_lambda.arn
  handler          = "lambda.githubWebhook"
  runtime          = "nodejs12.x"

  environment {
    variables = {
      GITHUB_APP_WEBHOOK_SECRET = var.github_app_webhook_secret
      SQS_URL_WEBHOOK           = var.sqs_build_queue.id
    }
  }

  tags = var.tags
}

resource "aws_lambda_permission" "webhook" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webhook.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.webhook.execution_arn}/*/*/${local.webhook_endpoint}"
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

resource "aws_iam_role" "webhook_lambda" {
  name               = "${var.environment}-action-webhook-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role_policy.json
  tags               = var.tags
}

resource "aws_iam_policy" "webhook_logging" {
  name        = "${var.environment}-lamda-logging-policy"
  description = "Lambda logging policy"

  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {})
}

resource "aws_iam_policy_attachment" "webhook_logging" {
  name       = "${var.environment}-logging"
  roles      = [aws_iam_role.webhook_lambda.name]
  policy_arn = aws_iam_policy.webhook_logging.arn
}

resource "aws_iam_policy" "webhook" {
  count = var.create_sqs_publish_policy ? 1 : 0

  name        = "${var.environment}-lamda-webhook-sqs-publish-policy"
  description = "Lambda webhook policy"

  policy = templatefile("${path.module}/policies/lambda-webhook.json", {
    sqs_resource_arn = var.sqs_build_queue.arn
  })
}

resource "aws_iam_policy_attachment" "webhook" {
  count = var.create_sqs_publish_policy ? 1 : 0

  name       = "${var.environment}-webhook"
  roles      = [aws_iam_role.webhook_lambda.name]
  policy_arn = aws_iam_policy.webhook[0].arn
}



