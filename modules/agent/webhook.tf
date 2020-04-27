locals {
  webhook_endpoint = "webhook"
}

resource "aws_apigatewayv2_api" "webhook" {
  name          = "${var.environment}-github-action-webhook"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_route" "webhook" {
  api_id    = aws_apigatewayv2_api.webhook.id
  route_key = "POST /${local.webhook_endpoint}"
  target    = "integrations/${aws_apigatewayv2_integration.webhook.id}"
}

resource "aws_apigatewayv2_stage" "webhook" {
  api_id      = aws_apigatewayv2_api.webhook.id
  name        = "$default"
  auto_deploy = true
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
  filename      = "webhook.zip"
  function_name = "${var.environment}-webhook"
  role          = aws_iam_role.webhook_lambda.arn
  handler       = "lambda.githubWebhook"
  runtime       = "nodejs12.x"

  environment {
    variables = {
      GITHUB_APP_WEBHOOK_SECRET = var.github_app_webhook_secret
    }
  }
}

resource "aws_lambda_permission" "webhook" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webhook.function_name
  principal     = "events.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.webhook.execution_arn}/*/*/${local.webhook_endpoint}"
}

resource "aws_iam_role" "webhook_lambda" {
  name               = "${var.environment}-action-webhook-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role_policy.json
}

resource "aws_iam_policy_attachment" "webhook_lambda" {
  name       = "${var.environment}-logging"
  roles      = [aws_iam_role.webhook_lambda.name]
  policy_arn = aws_iam_policy.lambda_logging.arn
}




