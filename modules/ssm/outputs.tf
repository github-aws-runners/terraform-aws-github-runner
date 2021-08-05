output "parameters" {
  value = {
    github_app_client_id = {
      name = aws_ssm_parameter.github_app_client_id.name
      arn  = aws_ssm_parameter.github_app_client_id.arn
    }
    github_app_client_secret = {
      name = aws_ssm_parameter.github_app_client_secret.name
      arn  = aws_ssm_parameter.github_app_client_secret.arn
    }
    github_app_id = {
      name = aws_ssm_parameter.github_app_id.name
      arn  = aws_ssm_parameter.github_app_id.arn
    }
    github_app_key_base64 = {
      name = aws_ssm_parameter.github_app_key_base64.name
      arn  = aws_ssm_parameter.github_app_key_base64.arn
    }
    github_app_webhook_secret = {
      name = aws_ssm_parameter.github_app_webhook_secret.name
      arn  = aws_ssm_parameter.github_app_webhook_secret.arn
    }
  }
}
