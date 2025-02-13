output "parameters" {
  value = {
    github_app_id = {
      name = coalesce(var.github_app.id_ssm, aws_ssm_parameter.github_app_id[0]).name
      arn  = coalesce(var.github_app.id_ssm, aws_ssm_parameter.github_app_id[0]).arn
    }
    github_app_key_base64 = {
      name = coalesce(var.github_app.key_base64_ssm, aws_ssm_parameter.github_app_key_base64[0]).name
      arn  = coalesce(var.github_app.key_base64_ssm, aws_ssm_parameter.github_app_key_base64[0]).arn
    }
    github_app_webhook_secret = {
      name = coalesce(var.github_app.webhook_secret_ssm, aws_ssm_parameter.github_app_webhook_secret[0]).name
      arn  = coalesce(var.github_app.webhook_secret_ssm, aws_ssm_parameter.github_app_webhook_secret[0]).arn
    }
  }
}
