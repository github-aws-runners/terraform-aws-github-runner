resource "null_resource" "update_app" {
  # The SSM keys are added only when set, so callers using key_base64 keep their existing triggers
  triggers = merge(
    {
      webhook_endpoint = var.webhook_endpoint
      webhook_secret   = var.github_app.webhook_secret
    },
    var.github_app.key_base64_ssm != null ? { key_base64_ssm_arn = var.github_app.key_base64_ssm.arn } : {},
    var.ssm_assume_role_arn != null ? { ssm_assume_role_arn = var.ssm_assume_role_arn } : {},
  )

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = "${path.module}/bin/update-app.sh"
    environment = {
      APP_ID                  = var.github_app.id
      APP_PRIVATE_KEY_BASE64  = var.github_app.key_base64_ssm == null ? var.github_app.key_base64 : ""
      APP_PRIVATE_KEY_SSM_ARN = var.github_app.key_base64_ssm != null ? var.github_app.key_base64_ssm.arn : ""
      SSM_ASSUME_ROLE_ARN     = var.ssm_assume_role_arn != null ? var.ssm_assume_role_arn : ""
      WEBHOOK_ENDPOINT        = var.webhook_endpoint
      WEBHOOK_SECRET          = var.github_app.webhook_secret
    }
    on_failure = continue
  }
}
