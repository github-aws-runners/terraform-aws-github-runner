locals {
  webhook_endpoint = "webhook"
  role_path        = var.role_path == null ? "/${var.prefix}/" : var.role_path
  lambda_zip       = var.lambda_zip == null ? "${path.module}/lambdas/webhook/webhook.zip" : var.lambda_zip
}

resource "aws_apigatewayv2_api" "webhook" {
  name          = "${var.prefix}-github-action-webhook"
  protocol_type = "HTTP"
  tags          = var.tags
}

resource "aws_apigatewayv2_authorizer" "webhook_authorizer" {
  count           = var.lambda_webhook_authorizer_id != null ? 1 : 0
  api_id          = aws_apigatewayv2_api.webhook.id
  authorizer_type = "REQUEST"
  authorizer_uri  = data.aws_lambda_function.authorization_function[count.index].invoke_arn

  identity_sources                  = []
  name                              = "${var.prefix}-github-action-webhook-authorizer"
  authorizer_payload_format_version = "2.0"
  authorizer_result_ttl_in_seconds  = 0
  enable_simple_responses           = true
}

resource "aws_apigatewayv2_route" "webhook" {
  count     = var.lambda_webhook_authorizer_id != null ? 0 : 1
  api_id    = aws_apigatewayv2_api.webhook.id
  route_key = "POST /${local.webhook_endpoint}"
  target    = "integrations/${aws_apigatewayv2_integration.webhook.id}"
}

resource "aws_apigatewayv2_route" "webhook_with_authorizer" {
  count              = var.lambda_webhook_authorizer_id != null ? 1 : 0
  api_id             = aws_apigatewayv2_api.webhook.id
  route_key          = "POST /${local.webhook_endpoint}"
  target             = "integrations/${aws_apigatewayv2_integration.webhook.id}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.webhook_authorizer[0].id
}

data "aws_lambda_function" "authorization_function" {
  count         = var.lambda_webhook_authorizer_id != null ? 1 : 0
  function_name = var.lambda_webhook_authorizer_id
}

resource "aws_lambda_permission" "my_authorizer_lambda_permission" {
  count         = var.lambda_webhook_authorizer_id != null ? 1 : 0
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = data.aws_lambda_function.authorization_function[count.index].function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_apigatewayv2_api.webhook.execution_arn}/authorizers/${aws_apigatewayv2_authorizer.webhook_authorizer[count.index].id}"
}


resource "aws_apigatewayv2_stage" "webhook" {
  lifecycle {
    ignore_changes = [
      // see bug https://github.com/terraform-providers/terraform-provider-aws/issues/12893
      default_route_settings,
      // not terraform managed
      deployment_id
    ]
  }

  api_id      = aws_apigatewayv2_api.webhook.id
  name        = "$default"
  auto_deploy = true
  dynamic "access_log_settings" {
    for_each = var.webhook_lambda_apigateway_access_log_settings[*]
    content {
      destination_arn = access_log_settings.value.destination_arn
      format          = access_log_settings.value.format
    }
  }
  tags = var.tags
}

resource "aws_apigatewayv2_integration" "webhook" {
  lifecycle {
    ignore_changes = [
      // not terraform managed
      passthrough_behavior
    ]
  }

  api_id           = aws_apigatewayv2_api.webhook.id
  integration_type = "AWS_PROXY"

  connection_type    = "INTERNET"
  description        = "GitHub App webhook for receiving build events."
  integration_method = "POST"
  integration_uri    = aws_lambda_function.webhook.invoke_arn
}
