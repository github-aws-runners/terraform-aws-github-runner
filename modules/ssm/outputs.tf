output "parameters" {
  value = {
    github_app_id = {
      name = aws_ssm_parameter.github_app_id.name
      arn  = aws_ssm_parameter.github_app_id.arn
    }
    github_app_key_base64 = {
      name = var.github_app.key_base64 == null ? data.aws_ssm_parameter.github_app_key_base64[0].name : aws_ssm_parameter.github_app_key_base64[0].name
      arn  = var.github_app.key_base64 == null ? data.aws_ssm_parameter.github_app_key_base64[0].arn : aws_ssm_parameter.github_app_key_base64[0].arn
    }
    github_app_webhook_secret = {
      name = aws_ssm_parameter.github_app_webhook_secret.name
      arn  = aws_ssm_parameter.github_app_webhook_secret.arn
    }
  }
}
