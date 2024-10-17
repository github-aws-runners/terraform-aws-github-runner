output "gateway" {
  value = aws_apigatewayv2_api.webhook
}

output "endpoint_relative_path" {
  value = local.webhook_endpoint
}

output "webhook" {
  value = var.mode == "direct" ? module.direct[0].webhook : module.eventbridge[0].webhook
}

output "dispatcher" {
  value = var.mode == "eventbridge" ? module.eventbridge[0].dispatcher : null
}

output "eventbridge" {
  value = var.mode == "eventbridge" ? module.eventbridge[0].eventbridge : null
}

### For backwards compatibility

output "lambda" {
  value = var.mode == "direct" ? module.direct[0].webhook.lambda : module.eventbridge[0].webhook.lambda
}

output "lambda_log_group" {
  value = var.mode == "direct" ? module.direct[0].webhook.log_group : module.eventbridge[0].webhook.log_group
}

output "role" {
  value = var.mode == "direct" ? module.direct[0].webhook.role : module.eventbridge[0].webhook.role
}



# output "webhook_lambda_function_name" {
#   value = module.webhook.lambda_function_name
# }

# output "webhook_cloudwatch_log_group_name" {
#   value = module.webhook.cloudwatch_log_group_name
# }
