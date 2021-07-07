resource "aws_ssm_parameter" "github_app_client_id" {
  name   = "/actions_runner/${var.environment}/github_app_client_id"
  type   = "SecureString"
  value  = var.github_app.client_id
  key_id = var.kms_key_id
}

resource "aws_ssm_parameter" "github_app_client_secret" {
  name   = "/actions_runner/${var.environment}/github_app_client_secret"
  type   = "SecureString"
  value  = var.github_app.client_secret
  key_id = var.kms_key_id
}

resource "aws_ssm_parameter" "github_app_id" {
  name   = "/actions_runner/${var.environment}/github_app_id"
  type   = "SecureString"
  value  = var.github_app.id
  key_id = var.kms_key_id
}

resource "aws_ssm_parameter" "github_app_key_base64" {
  name   = "/actions_runner/${var.environment}/github_app_key_base64"
  type   = "SecureString"
  value  = var.github_app.key_base64
  key_id = var.kms_key_id
}
