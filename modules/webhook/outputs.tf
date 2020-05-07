output "gateway" {
  value = aws_apigatewayv2_api.webhook
}

output "lambda" {
  value = aws_lambda_function.webhook
}

output "lambda_role" {
  value = aws_iam_role.webhook_lambda
}
