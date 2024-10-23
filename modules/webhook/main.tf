locals {
  webhook_endpoint = "webhook"
  role_path        = var.role_path == null ? "/${var.prefix}/" : var.role_path
  lambda_zip       = var.lambda_zip == null ? "${path.module}/../../lambdas/functions/webhook/webhook.zip" : var.lambda_zip
  auth_lambda_zip  = var.auth_lambda_zip == null ? "${path.module}/../../lambdas/functions/webhook-auth/webhook-auth.zip" : var.auth_lambda_zip
}

resource "aws_apigatewayv2_api" "webhook" {
  name          = "${var.prefix}-github-action-webhook"
  protocol_type = "HTTP"
  tags          = var.tags
}

resource "aws_apigatewayv2_route" "webhook" {
  api_id    = aws_apigatewayv2_api.webhook.id
  route_key = "POST /${local.webhook_endpoint}"
  target    = "integrations/${aws_apigatewayv2_integration.webhook.id}"

  lifecycle {
    ignore_changes = [
      # Ignore authorization related attributes to enable authenticator assignment to API route.
      # NOTE: We consider the ignores as a system intenral. Future changes will not trigger a breakig change.
      authorizer_id,
      authorization_type,
      authorization_scopes,
    ]
  }
}

resource "aws_apigatewayv2_stage" "webhook" {
  lifecycle {
    ignore_changes = [
      # see bug https://github.com/terraform-providers/terraform-provider-aws/issues/12893
      default_route_settings,
      # not terraform managed
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
      # not terraform managed
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


resource "aws_ssm_parameter" "runner_matcher_config" {
  name  = "${var.ssm_paths.root}/${var.ssm_paths.webhook}/runner-matcher-config"
  type  = "String"
  value = jsonencode(local.runner_matcher_config_sorted)
  tier  = var.matcher_config_parameter_store_tier
}

resource "aws_apigatewayv2_authorizer" "webhook_auth" {
  count = local.webhook_auth_enabled ? 1 : 0

  name                             = "webhook-auth"
  api_id                           = aws_apigatewayv2_api.webhook.id
  authorizer_type                  = "REQUEST"
  authorizer_uri                   = aws_lambda_function.webhook_auth[0].invoke_arn
  enable_simple_responses          = true
  authorizer_result_ttl_in_seconds = 0
}
