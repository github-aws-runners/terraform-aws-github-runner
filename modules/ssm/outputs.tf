output "parameters" {
  value = {
    github_app_id = var.github_app.id_ssm != null ? {
      name = var.github_app.id_ssm.name
      arn  = var.github_app.id_ssm.arn
      } : length(aws_ssm_parameter.github_app_id) > 0 ? {
      name = aws_ssm_parameter.github_app_id[0].name
      arn  = aws_ssm_parameter.github_app_id[0].arn
    } : null
    github_app_key_base64 = var.github_app.key_base64_ssm != null ? {
      name = var.github_app.key_base64_ssm.name
      arn  = var.github_app.key_base64_ssm.arn
      } : length(aws_ssm_parameter.github_app_key_base64) > 0 ? {
      name = aws_ssm_parameter.github_app_key_base64[0].name
      arn  = aws_ssm_parameter.github_app_key_base64[0].arn
    } : null
    github_app_webhook_secret = {
      name = var.github_app.webhook_secret_ssm != null ? var.github_app.webhook_secret_ssm.name : aws_ssm_parameter.github_app_webhook_secret[0].name
      arn  = var.github_app.webhook_secret_ssm != null ? var.github_app.webhook_secret_ssm.arn : aws_ssm_parameter.github_app_webhook_secret[0].arn
    }
    enterprise_pat = var.enterprise_pat != null ? {
      name = var.enterprise_pat.pat_ssm != null ? var.enterprise_pat.pat_ssm.name : aws_ssm_parameter.enterprise_pat[0].name
      arn  = var.enterprise_pat.pat_ssm != null ? var.enterprise_pat.pat_ssm.arn : aws_ssm_parameter.enterprise_pat[0].arn
    } : null
  }
}
