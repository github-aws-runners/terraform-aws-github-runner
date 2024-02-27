resource "aws_ssm_parameter" "github_app_id" {
  name   = "${var.path_prefix}/github_app_id"
  type   = "SecureString"
  value  = var.github_app.id
  key_id = local.kms_key_arn
  tags   = var.tags
}

resource "aws_ssm_parameter" "github_app_key_base64" {
  count  = var.github_app.key_base64 == null ? 0 : 1
  name   = "${var.path_prefix}/github_app_key_base64"
  type   = "SecureString"
  value  = var.github_app.key_base64
  key_id = local.kms_key_arn
  tags   = var.tags
}

data "aws_ssm_parameter" "github_app_key_base64" {
  count = var.github_app.key_base64 == null ? 1 : 0
  name  = "${var.path_prefix}/github_app_key_base64"
}

resource "aws_ssm_parameter" "github_app_webhook_secret" {
  name   = "${var.path_prefix}/github_app_webhook_secret"
  type   = "SecureString"
  value  = var.github_app.webhook_secret
  key_id = local.kms_key_arn
  tags   = var.tags
}
