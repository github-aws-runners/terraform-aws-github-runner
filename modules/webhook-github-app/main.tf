ephemeral "aws_ssm_parameter" "key_base64" {
  count = var.github_app.key_base64_ssm != null ? 1 : 0
  arn   = var.github_app.key_base64_ssm.arn
}

resource "null_resource" "update_app" {
  triggers = {
    webhook_endpoint = var.webhook_endpoint
    webhook_secret   = var.github_app.webhook_secret
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = "${path.module}/bin/update-app.sh"
    environment = {
      APP_ID                 = var.github_app.id
      APP_PRIVATE_KEY_BASE64 = var.github_app.key_base64_ssm != null ? ephemeral.aws_ssm_parameter.key_base64[0].value : var.github_app.key_base64
      WEBHOOK_ENDPOINT       = var.webhook_endpoint
      WEBHOOK_SECRET         = var.github_app.webhook_secret
    }
    on_failure = continue
  }
}
