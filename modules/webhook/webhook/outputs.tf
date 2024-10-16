# output "gateway" {
#   value = aws_apigatewayv2_api.webhook
# }

output "webhook_lambda_function" {
  value = aws_lambda_function.webhook
}

# output "lambda_log_group" {
#   value = aws_cloudwatch_log_group.webhook
# }

# output "role" {
#   value = aws_iam_role.webhook_lambda
# }

# output "endpoint_relative_path" {
#   value = local.webhook_endpoint
# }



# output "webhook_lambda_function_name" {
#   value = module.webhook.lambda_function_name
# }

# output "webhook_cloudwatch_log_group_name" {
#   value = module.webhook.cloudwatch_log_group_name
# }
