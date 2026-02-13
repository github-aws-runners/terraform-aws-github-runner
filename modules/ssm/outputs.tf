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

output "additional_app_parameters" {
  value = [
    for idx, app in var.additional_github_apps : {
      id = {
        name = app.id_ssm != null ? app.id_ssm.name : aws_ssm_parameter.additional_github_app_id[idx].name
        arn  = app.id_ssm != null ? app.id_ssm.arn : aws_ssm_parameter.additional_github_app_id[idx].arn
      }
      key_base64 = {
        name = app.key_base64_ssm != null ? app.key_base64_ssm.name : aws_ssm_parameter.additional_github_app_key_base64[idx].name
        arn  = app.key_base64_ssm != null ? app.key_base64_ssm.arn : aws_ssm_parameter.additional_github_app_key_base64[idx].arn
      }
      installation_id = app.installation_id != null || app.installation_id_ssm != null ? {
        name = app.installation_id_ssm != null ? app.installation_id_ssm.name : aws_ssm_parameter.additional_github_app_installation_id[idx].name
        arn  = app.installation_id_ssm != null ? app.installation_id_ssm.arn : aws_ssm_parameter.additional_github_app_installation_id[idx].arn
      } : null
    }
  ]
}
