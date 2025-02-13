output "parameters" {
  value = {
    github_app_id = {
      name = var.github_app.id_ssm != null ? var.github_app.id_ssm.name : aws_ssm_parameter.github_app_id[0].name
      arn  = var.github_app.id_ssm != null ? var.github_app.id_ssm.arn : aws_ssm_parameter.github_app_id[0].arn
    }
    github_app_key_base64 = {
      name = var.github_app.key_base64_ssm != null ? var.github_app.key_base64_ssm.name : aws_ssm_parameter.github_app_key_base64[0].name
      arn  = var.github_app.key_base64_ssm != null ? var.github_app.key_base64_ssm.arn : aws_ssm_parameter.github_app_key_base64[0].arn
    }
    github_app_webhook_secret = {
      name = var.github_app.webhook_secret_ssm != null ? var.github_app.webhook_secret_ssm.name : aws_ssm_parameter.github_app_webhook_secret[0].name
      arn  = var.github_app.webhook_secret_ssm != null ? var.github_app.webhook_secret_ssm.arn : aws_ssm_parameter.github_app_webhook_secret[0].arn
    }
  }
}
